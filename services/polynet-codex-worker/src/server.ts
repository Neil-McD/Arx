import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { CodexAppServerClient } from "./codexAppServerClient.ts";
import {
  buildDaytonaCodexConfigToml,
} from "./daytonaCodexConfig.ts";
import {
  buildDaytonaRuntimePolicyReceipt,
  DAYTONA_RUNTIME_POLICY,
} from "../../../shared/daytonaCodexRuntimePolicy.ts";
import {
  buildWorkspaceBashDynamicToolSpec,
  buildWorkspaceServeDynamicToolSpec,
  destroyBlaxelSandboxBestEffort,
  ensureBlaxelSandbox,
  normalizeToolCommand,
  previewText,
  readBlaxelEnvStatus,
  runBlaxelBash,
  safeResourceName,
  type BlaxelToolCallSummary,
} from "./blaxelTool.ts";
import {
  destroyDaytonaLocalWorkspaceBestEffort,
  ensureDaytonaLocalWorkspace,
  getDaytonaPreviewUrlPattern,
  getDaytonaWorkspaceRoot,
  readDaytonaLocalEnvStatus,
  runDaytonaLocalBash,
  startDaytonaLocalServer,
} from "./daytonaLocalWorkspaceTool.ts";
import { TimingCollector, elapsedMs, nowMs } from "./timing.ts";
import {
  formatWorkspacePreviewPortRange,
  normalizeWorkspacePreviewPort,
} from "../../../shared/workspacePreviewPort.ts";
import {
  CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
  CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
  CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES,
  CODEX_RUNTIME_ADAPTER_TOOL_NAMES,
  CODEX_WORKSPACE_BASH_TOOL_NAME,
  CODEX_WORKSPACE_SERVE_TOOL_NAME,
} from "../../../shared/harnessToolPolicy.ts";

type JsonRecord = Record<string, unknown>;

type WorkerWorkspaceHostId = "blaxel" | "daytona";

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
  codexThreadId: string | null;
  cancelRequested: boolean;
  serve: WorkerIngestConfig | null;
  platformTools: WorkerPlatformToolSpec[];
  platformToolBridge: {
    url: string;
    token: string;
    runToken: string | null;
    context: JsonRecord;
  } | null;
  runtimeToolBridge: {
    url: string;
    token: string;
    runToken: string | null;
    context: JsonRecord;
  } | null;
  platformToolProbe: string | null;
  sandboxName: string;
  workspaceHostId: WorkerWorkspaceHostId;
  workspaceRoot: string | null;
  localServeAvailable: boolean;
  fallbackCommand: string;
  commandTimeoutSeconds: number;
  timing: TimingCollector;
  toolCalls: BlaxelToolCallSummary[];
  assistantText: string;
  turnId: string | null;
  firstCodexEventAtMs: number | null;
  firstAssistantDeltaAtMs: number | null;
  lastAgentMessageItemId: string | null;
  firstWorkspaceToolRequestAtMs: number | null;
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
  runToken: string | null;
  terminalRunToken: string | null;
  toolRunToken: string | null;
  terminalUrl: string | null;
  toolUrl: string | null;
  context: JsonRecord;
};

type WorkerPlatformToolSpec = {
  name: string;
  description: string;
  inputSchema: JsonRecord;
};

type CodexDynamicToolsBuildResult = {
  dynamicTools: Record<string, unknown>[];
  receipt: JsonRecord;
};

function buildComputerScreenshotDynamicToolSpec(): Record<string, unknown> {
  return {
    name: CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
    description:
      "Capture a screenshot of the Daytona computer so you can visually inspect the running app or desktop. Use this when the user asks you to look at a preview, inspect the UI, or verify what is visible. Do not print raw provider URLs or image data.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  };
}

function buildComputerOpenUrlDynamicToolSpec(): Record<string, unknown> {
  return {
    name: CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
    description:
      "Open an HTTP(S) URL in the Daytona computer's visible browser before taking a screenshot. Use this after workspace_serve when you need to visually inspect the running localhost preview. Prefer localhost preview URLs and do not print raw provider URLs.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The HTTP(S) URL to open in the Daytona computer browser, usually a localhost preview URL such as http://localhost:3000/.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  };
}

function readDynamicToolName(tool: Record<string, unknown>): string {
  const namespace = String(tool.namespace ?? "").trim();
  const name = String(tool.name ?? "").trim();
  if (!name) return "";
  return namespace ? `${namespace}.${name}` : name;
}

function buildCodexDynamicTools(activeTurn: ActiveTurn): CodexDynamicToolsBuildResult {
  const dynamicTools: Record<string, unknown>[] = [];
  if (activeTurn.workspaceHostId !== "daytona") {
    dynamicTools.push(buildWorkspaceBashDynamicToolSpec());
  }
  if (activeTurn.serve || activeTurn.localServeAvailable) {
    dynamicTools.push(buildWorkspaceServeDynamicToolSpec());
  }
  if (activeTurn.runtimeToolBridge && activeTurn.workspaceHostId.startsWith("daytona")) {
    dynamicTools.push(
      buildComputerOpenUrlDynamicToolSpec(),
      buildComputerScreenshotDynamicToolSpec(),
    );
  }
  if (activeTurn.platformToolBridge) {
    dynamicTools.push(
      ...activeTurn.platformTools.map((tool) => ({
        namespace: "polynet",
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        // Probe turns project eagerly: the probe asserts the call rail, not
        // deferred tool discovery.
        deferLoading: !activeTurn.platformToolProbe,
      })),
    );
  }

  const toolNames = dynamicTools.map(readDynamicToolName).filter(Boolean);
  const forbiddenToolNameSet = new Set<string>(CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES);
  const forbiddenToolNamesPresent =
    activeTurn.workspaceHostId === "daytona"
      ? toolNames
          .map((name) => name.replace(/^polynet\./, ""))
          .filter(
            (name, index, list) =>
              forbiddenToolNameSet.has(name) && list.indexOf(name) === index,
          )
      : [];
  const polynetPlatformToolNames = dynamicTools
    .filter((tool) => String(tool.namespace ?? "").trim() === "polynet")
    .map((tool) => String(tool.name ?? "").trim())
    .filter(Boolean);
  const runtimeAdapterToolNameSet = new Set<string>(CODEX_RUNTIME_ADAPTER_TOOL_NAMES);
  const runtimeAdapterToolNames = toolNames.filter((name) =>
    runtimeAdapterToolNameSet.has(name),
  );
  const duplicateShellTool = toolNames.includes(CODEX_WORKSPACE_BASH_TOOL_NAME);

  return {
    dynamicTools,
    receipt: {
      workspace_host_id: activeTurn.workspaceHostId,
      workspace_access_mode:
        activeTurn.workspaceHostId === "daytona" ? "native_codex" : "dynamic_workspace_bash",
      duplicate_shell_tool: duplicateShellTool,
      shell_tool: duplicateShellTool ? CODEX_WORKSPACE_BASH_TOOL_NAME : null,
      tool_names: toolNames,
      runtime_adapter_tool_names: runtimeAdapterToolNames,
      polynet_platform_tool_names: polynetPlatformToolNames,
      forbidden_tool_names_present: forbiddenToolNamesPresent,
    },
  };
}

function isTransientComputerUseFailure(code: string | null, message: unknown): boolean {
  const normalized = `${code ?? ""} ${String(message ?? "")}`.toLowerCase();
  return (
    /connection is shut down/.test(normalized) ||
    /connection.*(?:closed|reset|terminated|refused)/.test(normalized) ||
    /socket hang up/.test(normalized) ||
    /\beconnreset\b|\betimedout\b|\btimeout\b/.test(normalized) ||
    /temporarily unavailable|service unavailable|gateway timeout/.test(normalized) ||
    /\b(?:502|503|504)\b/.test(normalized)
  );
}

function formatComputerUseFailureText(params: {
  toolName: "computer_open_url" | "computer_screenshot";
  failureCode: string | null;
  message: unknown;
}): string {
  const message = String(params.message ?? "").trim();
  if (isTransientComputerUseFailure(params.failureCode, message)) {
    return [
      `${params.toolName} could not visually inspect the preview because Daytona Computer Use was not ready after retry.`,
      "The app preview may still be running in the preview panel; try visual inspection again after a moment.",
    ].join(" ");
  }
  return `${params.toolName} failed (${params.failureCode ?? "unknown"}): ${
    message || "Computer-use tool failed."
  }`;
}

type RunTurnParams = {
  runId: string;
  prompt: string;
  developerInstructions: string | null;
  model: string;
  sandboxName: string;
  sandboxProvided: boolean;
  command: string;
  commandTimeoutSeconds: number;
  destroyAfterRun: boolean;
  probeMode: boolean;
  platformToolProbe: string | null;
  chatgptAuth: WorkerChatgptAuth | null;
  ingest: WorkerIngestConfig | null;
  platformTools: WorkerPlatformToolSpec[];
  writer: StreamWriter | null;
};

type WorkspaceProbeParams = {
  runId: string;
  sandboxName: string;
  sandboxProvided: boolean;
  command: string;
  commandTimeoutSeconds: number;
  destroyAfterRun: boolean;
};

type WorkerRuntimeOptions = {
  cwd: string;
  codexBin: string;
  model: string;
  authToken: string;
  workspaceHostId: WorkerWorkspaceHostId;
};

const CODEX_APPROVAL_POLICY = DAYTONA_RUNTIME_POLICY.nativeCodex.approvalPolicy;
const CODEX_THREAD_SANDBOX = DAYTONA_RUNTIME_POLICY.nativeCodex.threadSandbox;
const CODEX_TURN_SANDBOX_POLICY = DAYTONA_RUNTIME_POLICY.nativeCodex.turnSandboxPolicy;

type WorkerRuntimeHealth = {
  ok: boolean;
  status: "ok" | "initializing" | "degraded";
  worker_http_ready: true;
  machine_id: string | null;
  codex: {
    bin: string;
    model: string;
    version: string | null;
    running: boolean;
    initializing: boolean;
    initialized: boolean;
    init_latency_ms: number | null;
    init_error: string | null;
    codex_home: string | null;
    platform_family: string | null;
    platform_os: string | null;
  };
  blaxel: ReturnType<typeof readBlaxelEnvStatus>;
  daytona: ReturnType<typeof readDaytonaLocalEnvStatus>;
  workspace_host: {
    id: WorkerWorkspaceHostId;
    configured: boolean;
    workspace_root: string | null;
  };
  execution_policy: {
    runtime_policy: ReturnType<typeof buildDaytonaRuntimePolicyReceipt>;
    native_codex: {
      thread_approval_policy: typeof CODEX_APPROVAL_POLICY;
      thread_sandbox: typeof CODEX_THREAD_SANDBOX;
      turn_approval_policy: typeof CODEX_APPROVAL_POLICY;
      turn_sandbox_policy: {
        type: typeof CODEX_TURN_SANDBOX_POLICY.type;
        network_access?: false;
      };
    };
    workspace_tool_access: {
      mode: "native_codex" | "dynamic_workspace_bash";
      shell_tool: typeof CODEX_WORKSPACE_BASH_TOOL_NAME | null;
      access: "native" | "full";
      workspace_root: string | null;
    };
  };
};

export class WorkerBusyError extends Error {
  constructor() {
    super("worker_turn_in_progress");
    this.name = "WorkerBusyError";
  }
}

export class WorkerTurnCancelledError extends Error {
  constructor() {
    super("Run cancelled by user.");
    this.name = "WorkerTurnCancelledError";
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

function readMachineId(): string | null {
  return readEnv("FLY_MACHINE_ID") || null;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readEnv(name).toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function readWorkspaceHostId(): WorkerWorkspaceHostId {
  const raw = readEnv("POLYNET_CODEX_WORKSPACE_HOST").toLowerCase();
  if (raw === "daytona") return "daytona";
  return "blaxel";
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

let cachedCodexVersion: string | null | undefined;

const CODEX_APP_SERVER_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "CODEX_HOME",
] as const;

export function buildCodexAppServerEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CODEX_APP_SERVER_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith("LC_")) continue;
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }
  return env;
}

function getCodexVersion(codexBin: string): string | null {
  // The binary never changes for the life of the process; healthz is probed
  // every ~20s and must not spawn a process per probe.
  if (cachedCodexVersion !== undefined) return cachedCodexVersion;
  const result = spawnSync(codexBin, ["--version"], {
    encoding: "utf8",
    env: buildCodexAppServerEnv(process.env),
  });
  cachedCodexVersion =
    result.status === 0 ? String(result.stdout || result.stderr || "").trim() || null : null;
  return cachedCodexVersion;
}

function describeError(error: unknown): JsonRecord | null {
  if (!error) return null;
  const code =
    error instanceof WorkerBusyError
      ? "worker_busy"
      : error instanceof WorkerTurnCancelledError
        ? "user_cancelled"
        : "polynet_codex_worker_turn_failed";
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

export class PolynetCodexWorkerRuntime {
  private readonly options: WorkerRuntimeOptions;
  private client: CodexAppServerClient | null = null;
  private initializePromise: Promise<void> | null = null;
  private initializeStartedAtMs: number | null = null;
  private initializeFinishedAtMs: number | null = null;
  private initializeError: Error | null = null;
  private activeTurn: ActiveTurn | null = null;
  private activeWorkspaceProbeRunId: string | null = null;

  constructor(options: WorkerRuntimeOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializeStartedAtMs = nowMs();
    this.initializeFinishedAtMs = null;
    this.initializeError = null;
    this.initializePromise = this.startInner()
      .then(() => {
        this.initializeFinishedAtMs = nowMs();
      })
      .catch((error) => {
        this.initializeFinishedAtMs = nowMs();
        this.initializeError =
          error instanceof Error ? error : new Error(String(error ?? "codex_app_server_init_failed"));
        throw this.initializeError;
      });
    return this.initializePromise;
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.initializePromise = null;
    this.initializeStartedAtMs = null;
    this.initializeFinishedAtMs = null;
    this.initializeError = null;
    this.activeTurn = null;
    if (client) await client.stop();
  }

  isAuthorizedBearer(token: string): boolean {
    return Boolean(this.options.authToken) && token === this.options.authToken;
  }

  getWorkspaceHostId(): WorkerWorkspaceHostId {
    return this.options.workspaceHostId;
  }

  isBusy(): boolean {
    return this.activeTurn !== null || this.activeWorkspaceProbeRunId !== null;
  }

  health(): WorkerRuntimeHealth {
    const init = this.client?.initResult ?? null;
    const blaxel = readBlaxelEnvStatus();
    const daytona = readDaytonaLocalEnvStatus();
    const workspaceConfigured =
      this.options.workspaceHostId === "daytona" ? daytona.configured : blaxel.configured;
    const workspaceRoot =
      this.options.workspaceHostId === "daytona"
        ? daytona.workspaceRoot
        : blaxel.configured
          ? "/workspace"
          : null;
    const initialized = this.client?.isInitialized === true;
    const initializing =
      this.initializePromise !== null && !initialized && this.initializeError === null;
    const initLatencyMs =
      this.initializeStartedAtMs === null
        ? null
        : Math.max(
            0,
            (this.initializeFinishedAtMs ?? nowMs()) - this.initializeStartedAtMs,
          );
    const ok = workspaceConfigured && this.initializeError === null;
    const status: WorkerRuntimeHealth["status"] = !ok
      ? "degraded"
      : initialized
        ? "ok"
        : "initializing";
    return {
      ok,
      status,
      worker_http_ready: true,
      machine_id: readMachineId(),
      codex: {
        bin: this.options.codexBin,
        model: this.options.model,
        version: initialized ? getCodexVersion(this.options.codexBin) : null,
        running: this.client?.isRunning === true,
        initializing,
        initialized,
        init_latency_ms: initLatencyMs,
        init_error: this.initializeError?.message ?? null,
        codex_home: (init?.codexHome ?? readEnv("CODEX_HOME")) || null,
        platform_family: init?.platformFamily ?? null,
        platform_os: init?.platformOs ?? null,
      },
      blaxel,
      daytona,
      workspace_host: {
        id: this.options.workspaceHostId,
        configured: workspaceConfigured,
        workspace_root: workspaceRoot,
      },
      execution_policy: {
        runtime_policy: buildDaytonaRuntimePolicyReceipt(),
        native_codex: {
          thread_approval_policy: CODEX_APPROVAL_POLICY,
          thread_sandbox: CODEX_THREAD_SANDBOX,
          turn_approval_policy: CODEX_APPROVAL_POLICY,
          turn_sandbox_policy: {
            type: CODEX_TURN_SANDBOX_POLICY.type,
            ...(CODEX_TURN_SANDBOX_POLICY.type === "workspaceWrite"
              ? { network_access: CODEX_TURN_SANDBOX_POLICY.networkAccess }
              : {}),
          },
        },
        workspace_tool_access: {
          mode:
            this.options.workspaceHostId === "daytona"
              ? "native_codex"
              : "dynamic_workspace_bash",
          shell_tool:
            this.options.workspaceHostId === "daytona"
              ? null
              : CODEX_WORKSPACE_BASH_TOOL_NAME,
          access: this.options.workspaceHostId === "daytona" ? "native" : "full",
          workspace_root: workspaceRoot,
        },
      },
    };
  }

  private async ensureWorkspace(params: {
    sandboxName: string;
    sandboxProvided: boolean;
    labels?: Record<string, string>;
  }): Promise<{ providerSandboxId: string | null; workspaceRoot: string | null }> {
    if (this.options.workspaceHostId === "daytona") {
      return await ensureDaytonaLocalWorkspace({
        sandboxName: params.sandboxName,
        requireExisting: params.sandboxProvided,
      });
    }
    return await ensureBlaxelSandbox({
      sandboxName: params.sandboxName,
      requireExisting: params.sandboxProvided,
      labels: params.labels,
    });
  }

  private async destroyWorkspaceBestEffort(sandboxName: string): Promise<{
    ok: boolean;
    failureCode: string | null;
  }> {
    if (this.options.workspaceHostId === "daytona") {
      return await destroyDaytonaLocalWorkspaceBestEffort();
    }
    return await destroyBlaxelSandboxBestEffort(sandboxName);
  }

  private async runWorkspaceBash(params: {
    sandboxName: string;
    turnId: string | null;
    callId: string | null;
    command: string;
    timeoutSeconds: number;
  }) {
    if (this.options.workspaceHostId === "daytona") {
      return await runDaytonaLocalBash(params);
    }
    return await runBlaxelBash(params);
  }

  private buildCodexDeveloperInstructions(params: {
    polynetDeveloperInstructions: string | null;
    workspaceRoot: string | null;
    workspaceServeAvailable: boolean;
    platformToolsAvailable: boolean;
  }): string {
    if (this.options.workspaceHostId === "daytona") {
      const rendered = buildDaytonaCodexConfigToml({
        polynetDeveloperInstructions: params.polynetDeveloperInstructions,
        workspaceRoot: params.workspaceRoot ?? getDaytonaWorkspaceRoot(),
        previewUrlPattern: getDaytonaPreviewUrlPattern(),
        workspaceServeAvailable: params.workspaceServeAvailable,
        platformToolsAvailable: params.platformToolsAvailable,
      });
      return rendered.developerInstructions;
    }
    return [
      params.polynetDeveloperInstructions,
      [
        "You are running inside the PolyNet Codex worker service.",
        "These service instructions only describe execution mechanics; they do not replace PolyNet developer instructions, identity, tone, community context, project context, or user intent.",
        "Your workspace is a full-access remote Linux environment rooted at /workspace.",
        "You may create and edit files inside that workspace when the user asks.",
        "Use the dynamic tool named workspace_bash for shell commands; it can read, write, install, and run anything in that workspace.",
        ...(params.workspaceServeAvailable
          ? [
              "To run a server or app the user can see, call workspace_serve with the start command and port. PolyNet attaches the app to the user's preview panel. Never start servers with workspace_bash. Never print raw provider preview URLs.",
            ]
          : []),
        ...(params.platformToolsAvailable
          ? [
              "PolyNet platform tools are available under the polynet namespace for community context, resources, and product docs; discover them with tool search when the answer depends on the user's community or platform.",
            ]
          : []),
        "Never mention internal infrastructure, vendor, or hosting names; refer to the environment simply as the workspace.",
        "The local environment is not your workspace: never use local shell commands, local file edits, or local paths.",
        "Report tool output clearly and only with the detail the user needs.",
      ].join(" "),
    ]
      .filter((line) => String(line ?? "").trim().length > 0)
      .join("\n\n");
  }

  async runWorkspaceProbe(params: WorkspaceProbeParams): Promise<JsonRecord> {
    if (this.isBusy()) throw new WorkerBusyError();
    this.activeWorkspaceProbeRunId = params.runId;

    const timing = new TimingCollector();
    const eventLog: RuntimeEvent[] = [];
    const emitEvent = (eventType: string, payload: JsonRecord): RuntimeEvent => {
      const event: RuntimeEvent = {
        id: `${params.runId}:${eventLog.length + 1}:${eventType}`,
        run_id: params.runId,
        seq: eventLog.length + 1,
        event_type: eventType,
        payload,
        created_at: new Date().toISOString(),
      };
      eventLog.push(event);
      return event;
    };

    let sandboxEnsured = false;
    let toolCall: BlaxelToolCallSummary | null = null;
    try {
      emitEvent("workspace_probe_started", {
        engine_id: "polynet_codex_worker",
        machine_id: readMachineId(),
        workspace_host_id: this.options.workspaceHostId,
      });

      timing.startBucket("sandbox_ensure_ms");
      emitEvent("sandbox_ensure_started", {
        sandbox_name: params.sandboxName,
        workspace_host_id: this.options.workspaceHostId,
      });
      const ensured = await this.ensureWorkspace({
        sandboxName: params.sandboxName,
        sandboxProvided: params.sandboxProvided,
        labels: {
          run_id: safeResourceName(params.runId) || "unknown-run",
          purpose: "polynet-codex-worker-workspace-probe",
        },
      });
      sandboxEnsured = true;
      emitEvent("sandbox_ensure_finished", {
        sandbox_name: params.sandboxName,
        workspace_host_id: this.options.workspaceHostId,
        provider_sandbox_id: ensured.providerSandboxId,
        workspace_root: ensured.workspaceRoot,
        latency_ms: timing.endBucket("sandbox_ensure_ms"),
      });

      timing.startBucket("workspace_exec_ms");
      emitEvent("workspace_exec_requested", {
        sandbox_name: params.sandboxName,
        workspace_host_id: this.options.workspaceHostId,
        command: params.command,
      });
      const result = await this.runWorkspaceBash({
        sandboxName: params.sandboxName,
        turnId: null,
        callId: "workspace_probe",
        command: params.command,
        timeoutSeconds: params.commandTimeoutSeconds,
      });
      toolCall = result.summary;
      timing.setBucket("workspace_exec_ms", result.summary.latencyMs);
      emitEvent("workspace_exec_finished", {
        ok: result.summary.ok,
        latency_ms: result.summary.latencyMs,
        exit_code: result.summary.exitCode,
        provider_command_id: result.summary.providerCommandId,
        stdout_preview: previewText(result.summary.stdout),
        stderr_preview: previewText(result.summary.stderr),
      });

      const combined = `${toolCall.stdout}\n${toolCall.stderr}`;
      const expectedWorkspaceRoot = String(ensured.workspaceRoot ?? "/workspace");
      const proof = {
        ok:
          toolCall.ok &&
          combined.includes("POLYNET_CODEX_WORKER_SERVICE_PROBE") &&
          combined.includes(expectedWorkspaceRoot),
        failures: [
          ...(toolCall.ok ? [] : ["workspace_probe_command_not_ok"]),
          ...(combined.includes("POLYNET_CODEX_WORKER_SERVICE_PROBE")
            ? []
            : ["probe_marker_missing"]),
          ...(combined.includes(expectedWorkspaceRoot) ? [] : ["workspace_root_missing"]),
        ],
      };
      emitEvent("workspace_probe_finished", {
        ok: proof.ok,
        proof,
      });

      if (params.destroyAfterRun && sandboxEnsured) {
        timing.startBucket("sandbox_destroy_ms");
        const cleanup = await this.destroyWorkspaceBestEffort(params.sandboxName);
        emitEvent("sandbox_destroy_finished", {
          sandbox_name: params.sandboxName,
          workspace_host_id: this.options.workspaceHostId,
          ok: cleanup.ok,
          failure_code: cleanup.failureCode,
          latency_ms: timing.endBucket("sandbox_destroy_ms"),
        });
        sandboxEnsured = false;
      }

      return {
        ok: proof.ok,
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        probe_kind: "workspace",
        machine_id: readMachineId(),
        workspace_host_id: this.options.workspaceHostId,
        workspace_root: ensured.workspaceRoot,
        sandbox_name: params.sandboxName,
        tool_calls: [
          {
            turn_id: toolCall.turnId,
            call_id: toolCall.callId,
            command: toolCall.command,
            latency_ms: toolCall.latencyMs,
            ok: toolCall.ok,
            exit_code: toolCall.exitCode,
            stdout_preview: previewText(toolCall.stdout, 1000),
            stderr_preview: previewText(toolCall.stderr, 1000),
            provider_command_id: toolCall.providerCommandId,
          },
        ],
        proof,
        timing: timing.summary(),
        events: eventLog.map((event) => ({
          seq: event.seq,
          event_type: event.event_type,
          payload: event.payload,
          created_at: event.created_at,
        })),
      };
    } finally {
      if (params.destroyAfterRun && sandboxEnsured) {
        timing.startBucket("sandbox_destroy_ms");
        const cleanup = await this.destroyWorkspaceBestEffort(params.sandboxName);
        emitEvent("sandbox_destroy_finished", {
          sandbox_name: params.sandboxName,
          workspace_host_id: this.options.workspaceHostId,
          ok: cleanup.ok,
          failure_code: cleanup.failureCode,
          latency_ms: timing.endBucket("sandbox_destroy_ms"),
        });
      }
      this.activeWorkspaceProbeRunId = null;
    }
  }

  async runTurn(params: RunTurnParams): Promise<JsonRecord> {
    if (this.activeTurn) throw new WorkerBusyError();

    const activeTurn: ActiveTurn = {
      runId: params.runId,
      codexThreadId: null,
      cancelRequested: false,
      // Serving requires a project workspace (the sandbox outlives the turn)
      // and the Convex terminal bridge.
      serve:
        params.sandboxProvided && params.ingest?.terminalUrl ? params.ingest : null,
      platformTools: params.platformTools,
      platformToolBridge:
        params.ingest?.toolUrl && params.platformTools.length > 0
          ? {
              url: params.ingest.toolUrl,
              token: params.ingest.token,
              runToken: params.ingest.toolRunToken,
              context: params.ingest.context,
            }
          : null,
      runtimeToolBridge:
        params.ingest?.toolUrl && params.ingest.toolRunToken
          ? {
              url: params.ingest.toolUrl,
              token: params.ingest.token,
              runToken: params.ingest.toolRunToken,
              context: params.ingest.context,
            }
          : null,
      platformToolProbe: params.platformToolProbe,
      sandboxName: params.sandboxName,
      workspaceHostId: this.options.workspaceHostId,
      workspaceRoot: null,
      localServeAvailable: this.options.workspaceHostId === "daytona",
      fallbackCommand: params.command,
      commandTimeoutSeconds: params.commandTimeoutSeconds,
      timing: new TimingCollector(),
      toolCalls: [],
      assistantText: "",
      turnId: null,
      firstCodexEventAtMs: null,
      firstAssistantDeltaAtMs: null,
      lastAgentMessageItemId: null,
      firstWorkspaceToolRequestAtMs: null,
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

    const configuredTurnTimeoutSeconds = readIntegerEnv("POLYNET_CODEX_WORKER_TURN_TIMEOUT_SECONDS", 0);
    const turnTimeoutMs =
      configuredTurnTimeoutSeconds > 0 ? configuredTurnTimeoutSeconds * 1000 : null;
    const waitForTurnCompletion = (turnId: string, timeoutMs = turnTimeoutMs): Promise<JsonRecord> =>
      new Promise((resolve, reject) => {
        const timeout =
          typeof timeoutMs === "number" && timeoutMs > 0
            ? setTimeout(() => {
                activeTurn.turnCompletionResolvers.delete(turnId);
                // Optional operator backstop only; active agent turns do not
                // have a product hard cap by default.
                void this.interruptActiveTurnBestEffort("turn_timeout");
                reject(new Error(`timed out waiting for turn completion: ${turnId}`));
              }, timeoutMs)
            : null;
        const wrappedResolve = (value: JsonRecord) => {
          if (timeout) clearTimeout(timeout);
          resolve(value);
        };
        const current = activeTurn.turnCompletionResolvers.get(turnId) ?? [];
        current.push(wrappedResolve);
        activeTurn.turnCompletionResolvers.set(turnId, current);
      });

    let sandboxEnsured = false;
    let chatgptAuthApplied = false;
    try {
      activeTurn.timing.startBucket("codex_app_server_await_ms");
      try {
        await this.start();
        const codexAppServerAwaitMs = activeTurn.timing.endBucket("codex_app_server_await_ms");
        emitWorkerEvent("codex_app_server_await_finished", {
          ok: true,
          latency_ms: codexAppServerAwaitMs,
          initialized: this.client?.isInitialized === true,
        });
      } catch (error) {
        const codexAppServerAwaitMs = activeTurn.timing.endBucket("codex_app_server_await_ms");
        emitWorkerEvent("codex_app_server_await_finished", {
          ok: false,
          latency_ms: codexAppServerAwaitMs,
          message: error instanceof Error ? error.message : String(error ?? "codex_app_server_init_failed"),
        });
        throw error;
      }
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
        machine_id: readMachineId(),
        workspace_host_id: this.options.workspaceHostId,
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
        workspace_host_id: this.options.workspaceHostId,
      });
      const ensured = await this.ensureWorkspace({
        sandboxName: params.sandboxName,
        sandboxProvided: params.sandboxProvided,
        labels: {
          run_id: safeResourceName(params.runId) || "unknown-run",
        },
      });
      sandboxEnsured = true;
      activeTurn.workspaceRoot = ensured.workspaceRoot;
      const sandboxEnsureMs = activeTurn.timing.endBucket("sandbox_ensure_ms");
      emitWorkerEvent("sandbox_ensure_finished", {
        sandbox_name: params.sandboxName,
        workspace_host_id: this.options.workspaceHostId,
        provider_sandbox_id: ensured.providerSandboxId,
        workspace_root: ensured.workspaceRoot,
        latency_ms: sandboxEnsureMs,
      });

      const codexDeveloperInstructions = this.buildCodexDeveloperInstructions({
        polynetDeveloperInstructions: params.developerInstructions,
        workspaceRoot: activeTurn.workspaceRoot,
        workspaceServeAvailable: Boolean(activeTurn.serve || activeTurn.localServeAvailable),
        platformToolsAvailable: Boolean(activeTurn.platformToolBridge),
      });
      const codexThreadCwd =
        activeTurn.workspaceHostId === "daytona"
          ? (activeTurn.workspaceRoot ?? getDaytonaWorkspaceRoot())
          : this.options.cwd;
      const codexDynamicTools = buildCodexDynamicTools(activeTurn);
      emitWorkerEvent("codex_dynamic_tools_advertised", {
        ...codexDynamicTools.receipt,
        codex_thread_cwd: codexThreadCwd,
      });

      activeTurn.timing.startBucket("codex_thread_start_ms");
      const threadResponse = asRecord(
        await this.client.request("thread/start", {
          model: params.model,
          cwd: codexThreadCwd,
          approvalPolicy: CODEX_APPROVAL_POLICY,
          sandbox: CODEX_THREAD_SANDBOX,
          ephemeral: true,
          // Codex's own web search, billed to the user's ChatGPT account
          // (BYOK) — PolyNet never pays for searches.
          config: { web_search: DAYTONA_RUNTIME_POLICY.nativeCodex.webSearch },
          developerInstructions: codexDeveloperInstructions,
          dynamicTools: codexDynamicTools.dynamicTools,
          experimentalRawEvents: false,
          persistExtendedHistory: false,
        }),
      );
      const codexThreadStartMs = activeTurn.timing.endBucket("codex_thread_start_ms");
      const thread = asRecord(threadResponse?.thread);
      const threadId = typeof thread?.id === "string" ? thread.id : null;
      if (!threadId) throw new Error("thread/start did not return a thread id.");
      activeTurn.codexThreadId = threadId;
      emitWorkerEvent("codex_thread_started", {
        codex_thread_id: threadId,
        latency_ms: codexThreadStartMs,
        codex_thread_cwd: codexThreadCwd,
        developer_instruction_chars: codexDeveloperInstructions.length,
        polynet_developer_instructions_applied: Boolean(params.developerInstructions),
      });

      activeTurn.timing.startBucket("codex_turn_start_ack_ms");
      const turnStartedAtMs = nowMs();
      const turnResponse = asRecord(
        await this.client.request("turn/start", {
          threadId,
          input: [{ type: "text", text: params.prompt, text_elements: [] }],
          approvalPolicy: CODEX_APPROVAL_POLICY,
          sandboxPolicy: CODEX_TURN_SANDBOX_POLICY,
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
      const completion = await waitForTurnCompletion(turnId);
      if (completion.__codex_app_server_exited === true) {
        throw new Error(String(completion.message ?? "codex_app_server_exited"));
      }
      activeTurn.timing.setBucket("codex_turn_total_ms", elapsedMs(turnStartedAtMs));
      if (activeTurn.cancelRequested) {
        throw new WorkerTurnCancelledError();
      }

      proof = params.probeMode
        ? params.platformToolProbe
          ? validatePlatformToolProbeProof({
              eventLog: activeTurn.eventLog,
              toolCalls: activeTurn.toolCalls,
              toolName: params.platformToolProbe,
            })
          : validateProbeProof({
              toolCalls: activeTurn.toolCalls,
              workspaceRoot: activeTurn.workspaceRoot,
              workspaceHostId: activeTurn.workspaceHostId,
              assistantText: activeTurn.assistantText,
            })
        : { ok: true, failures: [] as string[] };
      summary = {
        ok: proof.ok,
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        model_id: params.model,
        machine_id: readMachineId(),
        sandbox_name: params.sandboxName,
        workspace_host_id: this.options.workspaceHostId,
        workspace_root: activeTurn.workspaceRoot,
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
        events: activeTurn.eventLog.map((event) => ({
          seq: event.seq,
          event_type: event.event_type,
          payload: event.payload,
          created_at: event.created_at,
        })),
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
        const cleanup = await this.destroyWorkspaceBestEffort(params.sandboxName);
        const sandboxDestroyMs = activeTurn.timing.endBucket("sandbox_destroy_ms");
        emitWorkerEvent("sandbox_destroy_finished", {
          sandbox_name: params.sandboxName,
          workspace_host_id: this.options.workspaceHostId,
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
            machine_id: readMachineId(),
            sandbox_name: params.sandboxName,
            workspace_host_id: this.options.workspaceHostId,
            workspace_root: activeTurn.workspaceRoot,
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
            events: activeTurn.eventLog.map((event) => ({
              seq: event.seq,
              event_type: event.event_type,
              payload: event.payload,
              created_at: event.created_at,
            })),
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
            run_token: params.ingest.runToken,
            context: params.ingest.context,
            status:
              pendingError instanceof WorkerTurnCancelledError
                ? "cancelled"
                : pendingError
                  ? "error"
                  : "ok",
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
    const codexAppServerEnv = buildCodexAppServerEnv(process.env);
    this.client = new CodexAppServerClient({
      codexBin: this.options.codexBin,
      cwd: this.options.cwd,
      env: codexAppServerEnv,
      onNotification: (message) => this.handleNotification(message),
      onServerRequest: (message) => this.handleServerRequest(message),
      onStderr: (line) => {
        process.stderr.write(`[codex app-server] ${line}\n`);
      },
      onClosed: (error) => {
        this.handleAppServerClosed(error);
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
      let delta = String(params.delta ?? "");
      if (!delta) return;
      // A turn streams several agentMessage ITEMS (narration before each tool
      // call, then the final answer); without a separator at item boundaries
      // their sentences glue together ("...a preview URL.This is a static...").
      const itemId = String(params.itemId ?? "");
      if (
        itemId &&
        activeTurn.lastAgentMessageItemId !== null &&
        itemId !== activeTurn.lastAgentMessageItemId &&
        activeTurn.assistantText.length > 0
      ) {
        delta = `\n\n${delta}`;
      }
      if (itemId) activeTurn.lastAgentMessageItemId = itemId;
      activeTurn.assistantText += delta;
      activeTurn.writer?.send("delta", {
        run_id: activeTurn.runId,
        delta,
        full_content: activeTurn.assistantText,
      });
      return;
    }

    if (method === "item/reasoning/summaryPartAdded" && params) {
      // Projected in the native loop's event shape so the existing timeline
      // renders worker thinking identically: sectioned, markdown-formatted.
      this.emitRuntimeEvent("reasoning_summary_part_added", {
        summary_stream_id: String(params.itemId ?? "default"),
        summary_index: Number(params.summaryIndex ?? 0),
      });
      return;
    }

    if (method === "item/reasoning/summaryTextDelta" && params) {
      const reasoningDelta = String(params.delta ?? "");
      if (!reasoningDelta) return;
      this.emitRuntimeEvent("reasoning_summary_text_delta", {
        summary_stream_id: String(params.itemId ?? "default"),
        summary_index: Number(params.summaryIndex ?? 0),
        delta: reasoningDelta,
      });
      return;
    }

    if (method === "item/started" && params) {
      const item = asRecord(params.item);
      this.emitRuntimeEvent("codex_item_started", {
        codex_turn_id: String(params.turnId ?? ""),
        item_id: String(item?.id ?? ""),
        item_type: String(item?.type ?? ""),
        tool: String(item?.tool ?? ""),
      });
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
      this.emitRuntimeEvent("codex_item_completed", {
        codex_turn_id: String(params.turnId ?? ""),
        item_id: String(item?.id ?? ""),
        item_type: String(item?.type ?? ""),
        tool: String(item?.tool ?? ""),
        status: String(item?.status ?? ""),
        success: item?.success === true,
        duration_ms: typeof item?.durationMs === "number" ? item.durationMs : null,
      });
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
        if (activeTurn) {
          activeTurn.timing.setBucket(
            "codex_approval_request_denied_ms",
            elapsedMs(activeTurn.timing.startedAtMs),
          );
          this.emitRuntimeEvent("codex_approval_request_denied", {
            method,
            reason: "worker_policy_declines_approval_requests",
          });
        }
        this.client.respond(message.id, { decision: "decline" });
        return;
      }
      if (method === "execCommandApproval" || method === "applyPatchApproval") {
        if (activeTurn) {
          activeTurn.timing.setBucket(
            "codex_approval_request_denied_ms",
            elapsedMs(activeTurn.timing.startedAtMs),
          );
          this.emitRuntimeEvent("codex_approval_request_denied", {
            method,
            reason: "worker_policy_declines_approval_requests",
          });
        }
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
    const toolName = String(params?.tool ?? "");
    if (params && toolName === CODEX_WORKSPACE_SERVE_TOOL_NAME) {
      await this.handleWorkspaceServeCall(message.id, activeTurn, params);
      return;
    }
    if (params && toolName === CODEX_COMPUTER_OPEN_URL_TOOL_NAME) {
      await this.handleComputerOpenUrlCall(message.id, activeTurn, params);
      return;
    }
    if (params && toolName === CODEX_COMPUTER_SCREENSHOT_TOOL_NAME) {
      await this.handleComputerScreenshotCall(message.id, activeTurn, params);
      return;
    }
    // Dynamic tool calls arrive with namespace and tool as separate fields;
    // everything in the polynet namespace routes to the platform bridge.
    if (params && String(params.namespace ?? "").trim() === "polynet") {
      await this.handlePlatformToolCall(message.id, activeTurn, toolName, params);
      return;
    }
    if (
      !params ||
      toolName !== CODEX_WORKSPACE_BASH_TOOL_NAME ||
      activeTurn.workspaceHostId === "daytona"
    ) {
      this.client.respondError(message.id, -32601, "unsupported dynamic tool");
      return;
    }
    const command = normalizeToolCommand(params.arguments, activeTurn.fallbackCommand);
    if (activeTurn.firstWorkspaceToolRequestAtMs === null) {
      activeTurn.firstWorkspaceToolRequestAtMs = nowMs();
      activeTurn.timing.setBucket(
        "first_workspace_exec_ms",
        activeTurn.firstWorkspaceToolRequestAtMs - activeTurn.timing.startedAtMs,
      );
    }
    this.emitRuntimeEvent("workspace_exec_requested", {
      codex_turn_id: typeof params.turnId === "string" ? params.turnId : null,
      call_id: typeof params.callId === "string" ? params.callId : null,
      sandbox_name: activeTurn.sandboxName,
      workspace_host_id: activeTurn.workspaceHostId,
      command,
    });
    const result = await this.runWorkspaceBash({
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
      workspace_host_id: activeTurn.workspaceHostId,
      provider_command_id: result.summary.providerCommandId,
      stdout_preview: previewText(result.summary.stdout),
      stderr_preview: previewText(result.summary.stderr),
    });
    this.client.respond(message.id, {
      success: result.summary.ok,
      contentItems: [{ type: "inputText", text: result.contentText }],
    });
  }

  private async handleComputerScreenshotCall(
    messageId: unknown,
    activeTurn: ActiveTurn,
    params: JsonRecord,
  ): Promise<void> {
    const client = this.client;
    if (!client) {
      process.stderr.write(
        "[polynet worker] computer_screenshot call arrived with no app-server client\n",
      );
      return;
    }
    const bridge = activeTurn.runtimeToolBridge;
    if (!bridge) {
      client.respond(messageId, {
        success: false,
        contentItems: [
          {
            type: "inputText",
            text: "computer_screenshot is unavailable for this turn.",
          },
        ],
      });
      return;
    }

    const startedAtMs = nowMs();
    this.emitRuntimeEvent("computer_tool_requested", {
      tool_name: "computer_screenshot",
      call_id: typeof params.callId === "string" ? params.callId : null,
      workspace_host_id: activeTurn.workspaceHostId,
    });

    let payload: JsonRecord = {};
    let ok = false;
    let failureCode: string | null = null;
    try {
      const response = await fetch(bridge.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridge.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_token: bridge.runToken,
          context: bridge.context,
          tool_name: "computer_screenshot",
          arguments: asRecord(params.arguments) ?? {},
        }),
        signal: AbortSignal.timeout(90_000),
      });
      payload = (await response.json().catch(() => ({}))) as JsonRecord;
      ok = response.ok && payload.ok === true;
      failureCode = ok ? null : String(payload.code ?? `http_${response.status}`);
    } catch (error) {
      failureCode = "computer_screenshot_bridge_unreachable";
      payload = {
        message:
          error instanceof Error
            ? error.message
            : "Computer screenshot bridge is unreachable.",
      };
    }

    this.emitRuntimeEvent("computer_tool_completed", {
      run_id: activeTurn.runId,
      tool_name: "computer_screenshot",
      latency_ms: elapsedMs(startedAtMs),
      status: ok ? "ok" : "error",
      error_code: failureCode,
      workspace_host_id: activeTurn.workspaceHostId,
      frame_storage_id: ok ? payload.frame_storage_id ?? null : null,
      screenshot_method: ok ? payload.screenshot_method ?? null : null,
    });

    if (!ok) {
      const text = formatComputerUseFailureText({
        toolName: "computer_screenshot",
        failureCode,
        message: payload.message ?? "Computer screenshot failed.",
      });
      client.respond(messageId, {
        success: false,
        contentItems: [{ type: "inputText", text }],
      });
      return;
    }

    const summary =
      String(payload.output ?? payload.summary ?? "").trim() ||
      "Captured Daytona computer screenshot.";
    const frameUrl = String(payload.frame_url ?? "").trim();
    const contentItems: JsonRecord[] = [{ type: "inputText", text: summary }];
    if (frameUrl) {
      contentItems.push({ type: "inputImage", imageUrl: frameUrl });
    }
    client.respond(messageId, {
      success: true,
      contentItems,
    });
  }

  private async handleComputerOpenUrlCall(
    messageId: unknown,
    activeTurn: ActiveTurn,
    params: JsonRecord,
  ): Promise<void> {
    const client = this.client;
    if (!client) {
      process.stderr.write(
        "[polynet worker] computer_open_url call arrived with no app-server client\n",
      );
      return;
    }
    const bridge = activeTurn.runtimeToolBridge;
    if (!bridge) {
      client.respond(messageId, {
        success: false,
        contentItems: [
          {
            type: "inputText",
            text: "computer_open_url is unavailable for this turn.",
          },
        ],
      });
      return;
    }

    const startedAtMs = nowMs();
    this.emitRuntimeEvent("computer_tool_requested", {
      tool_name: "computer_open_url",
      call_id: typeof params.callId === "string" ? params.callId : null,
      workspace_host_id: activeTurn.workspaceHostId,
    });

    let payload: JsonRecord = {};
    let ok = false;
    let failureCode: string | null = null;
    try {
      const response = await fetch(bridge.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridge.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_token: bridge.runToken,
          context: bridge.context,
          tool_name: "computer_open_url",
          arguments: asRecord(params.arguments) ?? {},
        }),
        signal: AbortSignal.timeout(90_000),
      });
      payload = (await response.json().catch(() => ({}))) as JsonRecord;
      ok = response.ok && payload.ok === true;
      failureCode = ok ? null : String(payload.code ?? `http_${response.status}`);
    } catch (error) {
      failureCode = "computer_open_url_bridge_unreachable";
      payload = {
        message:
          error instanceof Error
            ? error.message
            : "Computer open-url bridge is unreachable.",
      };
    }

    this.emitRuntimeEvent("computer_tool_completed", {
      run_id: activeTurn.runId,
      tool_name: "computer_open_url",
      latency_ms: elapsedMs(startedAtMs),
      status: ok ? "ok" : "error",
      error_code: failureCode,
      workspace_host_id: activeTurn.workspaceHostId,
    });

    if (!ok) {
      const text = formatComputerUseFailureText({
        toolName: "computer_open_url",
        failureCode,
        message: payload.message ?? "Computer open-url failed.",
      });
      client.respond(messageId, {
        success: false,
        contentItems: [{ type: "inputText", text }],
      });
      return;
    }

    const summary =
      String(payload.output ?? payload.summary ?? "").trim() ||
      "Opened URL in the Daytona computer browser.";
    client.respond(messageId, {
      success: true,
      contentItems: [{ type: "inputText", text: summary }],
    });
  }

  private handleAppServerClosed(error: Error): void {
    // A dead child must fail the active turn now, not after the 15-minute
    // completion timeout, and must not poison the next turn: clearing the
    // cached client lets start() respawn the app-server.
    this.client = null;
    this.initializePromise = null;
    const activeTurn = this.activeTurn;
    if (!activeTurn) return;
    this.emitRuntimeEvent("codex_app_server_exited", {
      message: error.message,
    });
    const failure = new Error(`codex_app_server_exited: ${error.message}`);
    for (const [turnId, waiters] of activeTurn.turnCompletionResolvers) {
      activeTurn.turnCompletionResolvers.delete(turnId);
      for (const waiter of waiters) {
        waiter({ __codex_app_server_exited: true, message: failure.message });
      }
    }
  }

  async interruptActiveTurnBestEffort(reason: string): Promise<boolean> {
    const activeTurn = this.activeTurn;
    const client = this.client;
    if (!activeTurn || !client) return false;
    if (!activeTurn.codexThreadId || !activeTurn.turnId) return false;
    this.emitRuntimeEvent("codex_turn_interrupt_requested", {
      codex_thread_id: activeTurn.codexThreadId,
      codex_turn_id: activeTurn.turnId,
      reason,
    });
    try {
      await client.request("turn/interrupt", {
        threadId: activeTurn.codexThreadId,
        turnId: activeTurn.turnId,
      });
      this.emitRuntimeEvent("codex_turn_interrupt_finished", { ok: true, reason });
      return true;
    } catch (error) {
      this.emitRuntimeEvent("codex_turn_interrupt_finished", {
        ok: false,
        reason,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async steerTurn(
    runId: string,
    text: string,
  ): Promise<
    | { ok: true; runId: string }
    | { ok: false; code: "no_matching_turn" | "turn_not_ready" | "steer_failed" }
  > {
    const activeTurn = this.activeTurn;
    const client = this.client;
    if (!activeTurn || activeTurn.runId !== runId || !client) {
      return { ok: false, code: "no_matching_turn" };
    }
    if (!activeTurn.codexThreadId || !activeTurn.turnId) {
      return { ok: false, code: "turn_not_ready" };
    }
    this.emitRuntimeEvent("turn_steer_requested", {
      text_preview: previewText(text, 200),
    });
    try {
      await client.request("turn/steer", {
        threadId: activeTurn.codexThreadId,
        expectedTurnId: activeTurn.turnId,
        input: [{ type: "text", text, text_elements: [] }],
      });
      this.emitRuntimeEvent("turn_steered", { ok: true });
      return { ok: true, runId };
    } catch (error) {
      this.emitRuntimeEvent("turn_steered", {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, code: "steer_failed" };
    }
  }

  async cancelTurn(runId: string): Promise<
    | { ok: true; runId: string }
    | { ok: false; code: "no_matching_turn" }
  > {
    const activeTurn = this.activeTurn;
    if (!activeTurn || activeTurn.runId !== runId) {
      return { ok: false, code: "no_matching_turn" };
    }
    activeTurn.cancelRequested = true;
    await this.interruptActiveTurnBestEffort("user_cancelled");
    return { ok: true, runId };
  }

  // Relays a polynet.* dynamic tool call to the Convex platform-tool bridge —
  // the same trust pattern as serve: the bearer plus the run-scoped context
  // is the credential, and Convex re-validates the run before dispatching.
  private async handlePlatformToolCall(
    messageId: unknown,
    activeTurn: ActiveTurn,
    toolName: string,
    params: JsonRecord,
  ): Promise<void> {
    const client = this.client;
    if (!client) {
      // The transport is gone; there is nothing to respond on. The turn is
      // already failing via handleAppServerClosed — log for observability.
      process.stderr.write(
        `[polynet worker] platform tool call ${toolName} arrived with no app-server client\n`,
      );
      return;
    }
    const bridge = activeTurn.platformToolBridge;
    if (!bridge || !activeTurn.platformTools.some((tool) => tool.name === toolName)) {
      client.respond(messageId, {
        success: false,
        contentItems: [
          {
            type: "inputText",
            text: `"${toolName}" is not an available platform tool for this turn.`,
          },
        ],
      });
      return;
    }
    const startedAtMs = nowMs();
    this.emitRuntimeEvent("platform_tool_requested", {
      tool_name: toolName,
      call_id: typeof params.callId === "string" ? params.callId : null,
    });
    let ok = false;
    let text = "";
    let failureCode: string | null = null;
    try {
      const response = await fetch(bridge.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridge.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_token: bridge.runToken,
          context: bridge.context,
          tool_name: toolName,
          arguments: asRecord(params.arguments) ?? {},
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const payload = (await response.json().catch(() => ({}))) as JsonRecord;
      ok = response.ok && payload.ok === true;
      if (ok) {
        // Success output is community/user content — never scrubbed.
        text = String(payload.output ?? "");
      } else {
        failureCode = String(payload.code ?? `http_${response.status}`);
        text = `${toolName} failed (${failureCode}): ${String(
          payload.message ?? "Platform tool call failed.",
        )}`.replace(/blaxel/gi, "workspace");
      }
    } catch (error) {
      failureCode = "platform_tool_bridge_unreachable";
      text = `${toolName} failed: ${
        error instanceof Error ? error.message : "platform tool bridge unreachable"
      }`.replace(/blaxel/gi, "workspace");
    }
    this.emitRuntimeEvent("platform_tool_finished", {
      tool_name: toolName,
      ok,
      latency_ms: elapsedMs(startedAtMs),
      failure_code: failureCode,
      output_preview: previewText(text),
    });
    client.respond(messageId, {
      success: ok,
      contentItems: [{ type: "inputText", text }],
    });
  }

  private async handleWorkspaceServeCall(
    messageId: unknown,
    activeTurn: ActiveTurn,
    params: JsonRecord,
  ): Promise<void> {
    const client = this.client;
    if (!client) {
      process.stderr.write(
        "[polynet worker] workspace_serve call arrived with no app-server client\n",
      );
      return;
    }
    const respondTool = (success: boolean, payload: JsonRecord) => {
      client.respond(messageId, {
        success,
        contentItems: [{ type: "inputText", text: JSON.stringify(payload, null, 2) }],
      });
    };
    const serve = activeTurn.serve;
    if (!serve && !activeTurn.localServeAvailable) {
      respondTool(false, {
        ok: false,
        failureCode: "project_workspace_required",
        failureMessage:
          "Serving an app requires a project-bound workspace. Ask the user to open this thread in a project.",
      });
      return;
    }
    const args = asRecord(params.arguments) ?? {};
    const command = String(args.command ?? "").trim();
    let port: number | null = null;
    try {
      port = normalizeWorkspacePreviewPort(args.port);
    } catch {
      port = null;
    }
    if (!command || port === null) {
      respondTool(false, {
        ok: false,
        failureCode: "invalid_arguments",
        failureMessage: `workspace_serve needs a command and a port between ${formatWorkspacePreviewPortRange()}.`,
      });
      return;
    }
    this.emitRuntimeEvent("workspace_serve_requested", { command, port });
    const startedAtMs = nowMs();
    if (activeTurn.localServeAvailable) {
      const served = await startDaytonaLocalServer({ command, port });
      this.emitRuntimeEvent("workspace_serve_finished", {
        ok: served.ok,
        port,
        latency_ms: elapsedMs(startedAtMs),
        workspace_host_id: activeTurn.workspaceHostId,
        terminal_session_id: served.ok ? served.pid : null,
        failure_code: served.ok ? null : served.failureCode,
      });
      if (served.ok) {
        this.emitRuntimeEvent("workspace_preview_ready", {
          provider: "daytona",
          workspace_host_id: activeTurn.workspaceHostId,
          sandbox_id: served.providerSandboxId,
          url: served.previewUrl,
          preview_url_hint: served.previewUrlHint,
          port,
          terminal_session_id: served.pid,
        });
        respondTool(true, {
          ok: true,
          preview_url: served.previewUrl,
          preview_pending: served.previewUrl ? false : true,
          port,
          process_id: served.pid,
          note: served.previewUrl
            ? "The app is running; the user can open it from the preview panel or this URL."
            : "The app is running; PolyNet is attaching the Daytona preview panel.",
          ...(served.outputTail ? { server_output: served.outputTail } : {}),
        });
        return;
      }
      respondTool(false, {
        ok: false,
        failureCode: served.failureCode,
        failureMessage: served.failureMessage.replace(/daytona/gi, "workspace"),
        ...(served.outputTail ? { server_output: served.outputTail } : {}),
      });
      return;
    }
    try {
      const response = await fetch(serve.terminalUrl as string, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serve.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_token: serve.terminalRunToken,
          context: serve.context,
          command,
          port,
          label: "codex-serve",
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const payload = (await response.json().catch(() => ({}))) as JsonRecord;
      const ok = response.ok && payload.ok === true;
      const previewUrl = String(payload.preview_url ?? "").trim();
      this.emitRuntimeEvent("workspace_serve_finished", {
        ok,
        port,
        latency_ms: elapsedMs(startedAtMs),
        terminal_session_id: payload.terminal_session_id ?? null,
        failure_code: ok ? null : String(payload.code ?? `http_${response.status}`),
      });
      if (ok && previewUrl) {
        this.emitRuntimeEvent("workspace_preview_ready", {
          url: previewUrl,
          port,
          terminal_session_id: payload.terminal_session_id ?? null,
        });
        respondTool(true, {
          ok: true,
          preview_url: previewUrl,
          port,
          note: "The app is running; the user can open it from the preview panel or this URL.",
        });
        return;
      }
      respondTool(false, {
        ok: false,
        failureCode: String(payload.code ?? `http_${response.status}`).replace(/blaxel/gi, "workspace"),
        failureMessage: String(payload.message ?? "The app could not be started.").replace(/blaxel/gi, "workspace"),
        ...(typeof payload.output_tail === "string" && payload.output_tail
          ? { server_output: String(payload.output_tail).replace(/blaxel/gi, "workspace") }
          : {}),
        ...(typeof payload.terminal_session_id === "string" && payload.terminal_session_id
          ? { terminal_session_id: payload.terminal_session_id }
          : {}),
        ...(typeof payload.server_status === "string" && payload.server_status
          ? { server_status: payload.server_status }
          : {}),
      });
    } catch (error) {
      this.emitRuntimeEvent("workspace_serve_finished", {
        ok: false,
        port,
        latency_ms: elapsedMs(startedAtMs),
        failure_code: "serve_bridge_unreachable",
      });
      respondTool(false, {
        ok: false,
        failureCode: "serve_bridge_unreachable",
        failureMessage:
          error instanceof Error ? error.message.replace(/blaxel/gi, "workspace") : "Serve failed.",
      });
    }
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
  const runId = readIngestRunId(params.payload);
  const ingestPath = readUrlPath(params.ingest.url);
  let lastStatus: number | null = null;
  let lastResponseCode: string | null = null;
  let lastResponseMessage: string | null = null;
  let lastErrorName: string | null = null;
  let lastErrorMessage: string | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    attempts = attempt;
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
      lastStatus = response.status;
      const responseSummary = await readIngestFailureResponseSummary(response);
      lastResponseCode = responseSummary.code;
      lastResponseMessage = responseSummary.message;
      if (response.ok) {
        process.stdout.write(
          `${JSON.stringify({
            kind: "polynet_codex_worker_service_event",
            event: "ingest_push_succeeded",
            run_id: runId,
            attempt,
            ingest_path: ingestPath,
          })}\n`,
        );
        return;
      }
      // 4xx means the payload or auth is wrong; retrying cannot help.
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      const failure = summarizeIngestPushError(error);
      lastErrorName = failure.name;
      lastErrorMessage = failure.message;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  process.stderr.write(
    `${JSON.stringify({
      kind: "polynet_codex_worker_service_event",
      event: "ingest_push_failed",
      run_id: runId,
      attempts,
      ingest_path: ingestPath,
      last_status: lastStatus,
      last_response_code: lastResponseCode,
      last_response_message: lastResponseMessage,
      last_error_name: lastErrorName,
      last_error_message: lastErrorMessage,
    })}\n`,
  );
}

function readIngestRunId(payload: JsonRecord): string | null {
  const context = asRecord(payload.context);
  const runId = String(context?.run_id ?? payload.run_id ?? "").trim();
  return runId ? previewText(runId, 160) : null;
}

function readUrlPath(url: string): string | null {
  try {
    return new URL(url).pathname || null;
  } catch {
    return null;
  }
}

async function readIngestFailureResponseSummary(response: Response): Promise<{
  code: string | null;
  message: string | null;
}> {
  if (response.ok) return { code: null, message: null };
  try {
    const text = await response.text();
    const parsed = asRecord(text ? JSON.parse(text) : {});
    const code = String(parsed?.code ?? "").trim();
    const message = String(parsed?.message ?? parsed?.error ?? "").trim();
    return {
      code: code ? previewText(code, 120) : null,
      message: message ? previewText(message, 300) : null,
    };
  } catch {
    return { code: null, message: null };
  }
}

function summarizeIngestPushError(error: unknown): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      name: previewText(error.name || "Error", 80),
      message: previewText(error.message, 300),
    };
  }
  return {
    name: "Error",
    message: previewText(String(error ?? "unknown_error"), 300),
  };
}

function validateProbeProof(params: {
  toolCalls: BlaxelToolCallSummary[];
  workspaceRoot: string | null;
  workspaceHostId: WorkerWorkspaceHostId;
  assistantText: string;
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (params.workspaceHostId === "daytona") {
    if (params.toolCalls.length !== 0) failures.push("unexpected_duplicate_workspace_tool_call");
    const expectedWorkspaceRoot = String(params.workspaceRoot ?? getDaytonaWorkspaceRoot());
    if (!params.assistantText.includes("POLYNET_CODEX_WORKER_SERVICE_PROBE")) {
      failures.push("probe_marker_missing");
    }
    if (!params.assistantText.includes(expectedWorkspaceRoot)) failures.push("workspace_root_missing");
    return {
      ok: failures.length === 0,
      failures,
    };
  }
  if (params.toolCalls.length !== 1) failures.push("expected_exactly_one_workspace_tool_call");
  const first = params.toolCalls[0] ?? null;
  if (!first?.ok) failures.push("workspace_tool_call_not_ok");
  const combined = `${first?.stdout ?? ""}\n${first?.stderr ?? ""}`;
  if (!combined.includes("POLYNET_CODEX_WORKER_SERVICE_PROBE")) {
    failures.push("probe_marker_missing");
  }
  const expectedWorkspaceRoot = String(params.workspaceRoot ?? "/workspace");
  if (!combined.includes(expectedWorkspaceRoot)) failures.push("workspace_root_missing");
  return {
    ok: failures.length === 0,
    failures,
  };
}

function validatePlatformToolProbeProof(params: {
  eventLog: RuntimeEvent[];
  toolCalls: BlaxelToolCallSummary[];
  toolName: string;
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const requested = params.eventLog.filter(
    (event) =>
      event.event_type === "platform_tool_requested" &&
      String(event.payload.tool_name ?? "") === params.toolName,
  );
  const finished = params.eventLog.filter(
    (event) =>
      event.event_type === "platform_tool_finished" &&
      String(event.payload.tool_name ?? "") === params.toolName,
  );
  if (requested.length === 0) failures.push("platform_tool_request_missing");
  if (finished.length === 0) failures.push("platform_tool_finish_missing");
  if (params.toolCalls.length !== 0) failures.push("unexpected_workspace_exec");
  return { ok: failures.length === 0, failures };
}

function buildProbePrompt(command: string, workspaceHostId: WorkerWorkspaceHostId): string {
  if (workspaceHostId === "daytona") {
    return [
      "Use Codex's native workspace execution capabilities to run this shell command from the workspace root:",
      command,
      "Report the exact stdout. Do not call workspace_bash; that duplicate tool is intentionally unavailable in Daytona mode.",
    ].join(" ");
  }
  return [
    `Call workspace_bash exactly once with command \`${command}\`.`,
    "Then summarize the output and say whether it ran in the workspace.",
    "Do not call any other tools.",
  ].join(" ");
}

function buildPlatformToolProbePrompt(toolName: string): string {
  return [
    `Call the ${toolName} tool exactly once with a short test query.`,
    "Then report the tool's response verbatim, including any error it returned.",
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
  const defaultModelId = DAYTONA_RUNTIME_POLICY.nativeCodex.defaultModelId;
  const model =
    String(body.model ?? readEnv("POLYNET_CODEX_WORKER_MODEL") ?? defaultModelId).trim() ||
    defaultModelId;
  const runId =
    String(body.run_id ?? body.runId ?? "").trim() || `polynet_codex_worker:${randomUUID()}`;
  const command = String(
    body.command ??
      "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s",
  ).trim();
  const platformToolProbe = String(body.platform_tool_probe ?? "").trim();
  const prompt = params.probeMode
    ? platformToolProbe
      ? buildPlatformToolProbePrompt(platformToolProbe)
      : buildProbePrompt(command, params.runtime.getWorkspaceHostId())
    : String(body.prompt ?? "").trim();
  const developerInstructions = params.probeMode
    ? null
    : String(body.developer_instructions ?? body.developerInstructions ?? "").trim() || null;
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
  // Provided names refer to sandboxes Convex already created (requireExisting),
  // so any transformation here would silently look up the wrong sandbox.
  // Reject non-canonical names instead of sanitizing them.
  const sandboxName = sandboxProvided
    ? providedSandboxName
    : safeResourceName(`polynet-codex-worker-svc-${randomUUID().slice(0, 8)}`);
  if (sandboxProvided && safeResourceName(providedSandboxName) !== providedSandboxName) {
    sendJson(params.res, 400, {
      ok: false,
      code: "invalid_sandbox_name",
      message: "sandbox_name must be a canonical lowercase resource name.",
      run_id: runId,
    });
    return;
  }
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
  const ingestRunToken = String(rawIngest?.run_token ?? "").trim() || null;
  const ingestTerminalRunToken =
    String(rawIngest?.terminal_run_token ?? "").trim() || null;
  const ingestToolRunToken = String(rawIngest?.tool_run_token ?? "").trim() || null;
  const ingestContext = asRecord(rawIngest?.context);
  const ingestTerminalUrl = String(rawIngest?.terminal_url ?? "").trim() || null;
  const ingestToolUrl = String(rawIngest?.tool_url ?? "").trim() || null;
  const ingest: WorkerIngestConfig | null =
    ingestUrl && ingestToken && ingestContext
      ? {
          url: ingestUrl,
          token: ingestToken,
          runToken: ingestRunToken,
          terminalRunToken: ingestTerminalRunToken,
          toolRunToken: ingestToolRunToken,
          terminalUrl: ingestTerminalUrl,
          toolUrl: ingestToolUrl,
          context: ingestContext,
        }
      : null;
  const platformTools: WorkerPlatformToolSpec[] = Array.isArray(body.platform_tools)
    ? (body.platform_tools as unknown[])
        .map((raw) => {
          const record = asRecord(raw);
          const name = String(record?.name ?? "").trim();
          const description = String(record?.description ?? "").trim();
          const inputSchema = asRecord(record?.input_schema);
          if (!name || !description || !inputSchema) return null;
          return { name, description, inputSchema };
        })
        .filter((spec): spec is WorkerPlatformToolSpec => spec !== null)
    : [];

  if (!chatgptAuth) {
    sendJson(params.res, 400, {
      ok: false,
      code: "chatgpt_auth_required",
      message:
        "chatgpt_auth with access_token and chatgpt_account_id is required for Codex worker turns.",
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
        developerInstructions,
        model,
        sandboxName,
        sandboxProvided,
        command,
        commandTimeoutSeconds,
        destroyAfterRun,
        probeMode: params.probeMode,
        platformToolProbe: params.probeMode ? platformToolProbe || null : null,
        chatgptAuth,
        ingest,
        platformTools,
        writer,
      });
    } catch (error) {
      writeSse(params.res, "error", {
        run_id: runId,
        code:
          error instanceof WorkerBusyError
            ? "worker_busy"
            : error instanceof WorkerTurnCancelledError
              ? "user_cancelled"
              : "polynet_codex_worker_turn_failed",
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
      developerInstructions,
      model,
      sandboxName,
      sandboxProvided,
      command,
      commandTimeoutSeconds,
      destroyAfterRun,
      probeMode: params.probeMode,
      platformToolProbe: params.probeMode ? platformToolProbe || null : null,
      chatgptAuth,
      ingest,
      platformTools,
      writer: null,
    });
    sendJson(params.res, 200, result);
  } catch (error) {
    if (error instanceof WorkerBusyError) {
      sendWorkerBusy(params.res, runId);
      return;
    }
    if (error instanceof WorkerTurnCancelledError) {
      sendJson(params.res, 200, {
        ok: false,
        run_id: runId,
        error: { code: "user_cancelled", message: error.message },
      });
      return;
    }
    throw error;
  }
}

async function handleWorkspaceProbeEndpoint(params: {
  runtime: PolynetCodexWorkerRuntime;
  req: IncomingMessage;
  res: ServerResponse;
}): Promise<void> {
  const body = asRecord(await readJsonBody(params.req)) ?? {};
  const runId =
    String(body.run_id ?? body.runId ?? "").trim() || `polynet_workspace_probe:${randomUUID()}`;
  const command = String(
    body.command ??
      "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s",
  ).trim();
  const providedSandboxName = String(body.sandbox_name ?? body.sandboxName ?? "").trim();
  const sandboxProvided = providedSandboxName.length > 0;
  const sandboxName = sandboxProvided
    ? providedSandboxName
    : safeResourceName(`polynet-codex-worker-ws-${randomUUID().slice(0, 8)}`);
  if (sandboxProvided && safeResourceName(providedSandboxName) !== providedSandboxName) {
    sendJson(params.res, 400, {
      ok: false,
      code: "invalid_sandbox_name",
      message: "sandbox_name must be a canonical lowercase resource name.",
      run_id: runId,
    });
    return;
  }
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

  try {
    const result = await params.runtime.runWorkspaceProbe({
      runId,
      sandboxName,
      sandboxProvided,
      command,
      commandTimeoutSeconds,
      destroyAfterRun,
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
        const health = runtime.health();
        // Public health is minimal; machine ids, codex home, and Blaxel
        // workspace details are diagnostics for authenticated callers only.
        if (!runtime.isAuthorizedBearer(readBearer(req))) {
          sendJson(res, 200, { ok: health.ok, status: health.status });
          return;
        }
        sendJson(res, 200, health);
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/codex/turn/steer") {
        if (!runtime.isAuthorizedBearer(readBearer(req))) {
          sendJson(res, 401, {
            ok: false,
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          });
          return;
        }
        const body = asRecord(await readJsonBody(req)) ?? {};
        const runId = String(body.run_id ?? body.runId ?? "").trim();
        const text = String(body.text ?? "").trim();
        if (!runId || !text) {
          sendJson(res, 400, { ok: false, code: "run_id_and_text_required" });
          return;
        }
        const steered = await runtime.steerTurn(runId, text);
        if (!steered.ok) {
          sendJson(res, 409, { ok: false, code: steered.code, run_id: runId });
          return;
        }
        sendJson(res, 200, { ok: true, run_id: runId });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/codex/turn/cancel") {
        if (!runtime.isAuthorizedBearer(readBearer(req))) {
          sendJson(res, 401, {
            ok: false,
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          });
          return;
        }
        const body = asRecord(await readJsonBody(req)) ?? {};
        const runId = String(body.run_id ?? body.runId ?? "").trim();
        if (!runId) {
          sendJson(res, 400, { ok: false, code: "run_id_required" });
          return;
        }
        const cancelled = await runtime.cancelTurn(runId);
        if (!cancelled.ok) {
          sendJson(res, 409, { ok: false, code: cancelled.code, run_id: runId });
          return;
        }
        sendJson(res, 200, { ok: true, run_id: runId });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/workspace/probe") {
        if (!runtime.isAuthorizedBearer(readBearer(req))) {
          sendJson(res, 401, {
            ok: false,
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          });
          return;
        }
        await handleWorkspaceProbeEndpoint({ runtime, req, res });
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
  runtime: { stop: () => Promise<void>; health: () => WorkerRuntimeHealth | Promise<JsonRecord> };
  server: http.Server;
  port: number;
}> {
  const port = readIntegerEnv("PORT", readIntegerEnv("POLYNET_CODEX_WORKER_PORT", 8787));
  const host = readEnv("POLYNET_CODEX_WORKER_HOST") || "127.0.0.1";
  const authToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!authToken) throw new Error("POLYNET_CODEX_WORKER_AUTH_TOKEN is required.");
  const workspaceHostId = readWorkspaceHostId();
  const defaultAgentCwd =
    workspaceHostId === "daytona" ? getDaytonaWorkspaceRoot() : process.cwd();
  const runtime = new PolynetCodexWorkerRuntime({
    cwd: readEnv("POLYNET_CODEX_WORKER_AGENT_CWD") || defaultAgentCwd,
    codexBin: readEnv("POLYNET_CODEX_WORKER_CODEX_BIN") || "codex",
    model:
      readEnv("POLYNET_CODEX_WORKER_MODEL") ||
      DAYTONA_RUNTIME_POLICY.nativeCodex.defaultModelId,
    authToken,
    workspaceHostId,
  });
  const server = createPolynetCodexWorkerServer(runtime);
  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });
  const codexInitStartedAtMs = nowMs();
  void runtime
    .start()
    .then(() => {
      process.stdout.write(
        `${JSON.stringify({
          kind: "polynet_codex_worker_service_event",
          event: "codex_app_server_background_init_finished",
          latency_ms: elapsedMs(codexInitStartedAtMs),
        })}\n`,
      );
    })
    .catch((error) => {
      process.stdout.write(
        `${JSON.stringify({
          kind: "polynet_codex_worker_service_event",
          event: "codex_app_server_background_init_failed",
          latency_ms: elapsedMs(codexInitStartedAtMs),
          message: error instanceof Error ? error.message : String(error ?? "codex_app_server_init_failed"),
        })}\n`,
      );
    });
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  process.stdout.write(
    `${JSON.stringify({
      kind: "polynet_codex_worker_service_event",
      event: "http_server_listening",
      host,
      url: `http://${displayHost}:${port}`,
      workspace_host_id: runtime.health().workspace_host.id,
      codex_init_mode: "background",
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
