import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DAYTONA_RUNTIME_POLICY } from "../services/polynet-codex-worker/src/daytonaRuntimePolicy.ts";

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WORKER_PORT = 8877;
const REMOTE_ROOT = "/home/daytona/polynet";
const REMOTE_TARBALL = "/home/daytona/polynet-codex-runtime-smoke.tgz";
const REMOTE_WORKER_LOG = "/tmp/polynet-codex-worker.log";
const REMOTE_WORKER_PID = "/tmp/polynet-codex-worker.pid";
const DEFAULT_CODEX_PACKAGE = "@openai/codex@0.141.0";
const TURN_PROOF_FILE = "/home/daytona/polynet-daytona-turn-proof.txt";
const TURN_PROOF_MARKER = "daytona-turn-proof-context-ok";
const TURN_PROOF_ASSISTANT_SENTINEL = "daytona-context-ok";

type DaytonaClient = {
  create(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<DaytonaSandbox>;
  get(sandboxIdOrName: string): Promise<DaytonaSandbox>;
  delete?(sandbox: DaytonaSandbox, timeout?: number): Promise<void>;
};

type DaytonaSandbox = {
  id: string;
  name?: string;
  state?: string;
  computerUse?: {
    start?(): Promise<unknown>;
    stop?(): Promise<unknown>;
    getStatus?(): Promise<unknown>;
    screenshot?: {
      takeFullScreen?(showCursor?: boolean): Promise<unknown>;
      takeCompressed?(options?: Record<string, unknown>): Promise<unknown>;
    };
  };
  fs: {
    uploadFile(file: string | Buffer, remotePath: string, timeout?: number): Promise<void>;
  };
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<{
      exitCode: number;
      result?: string;
      artifacts?: {
        stdout?: string;
      };
    }>;
  };
  start?(timeout?: number): Promise<void>;
  waitUntilStarted?(timeout?: number): Promise<void>;
  getSignedPreviewUrl?(
    port: number,
    expiresInSeconds?: number,
  ): Promise<{
    url?: string;
    token?: string;
  }>;
  delete?(timeout?: number): Promise<void>;
};

type SmokeArgs = {
  live: boolean;
  requireLive: boolean;
  keepSandbox: boolean;
  prepareOnly: boolean;
  computerUseProof: boolean;
};

type SmokeChatgptAuth = {
  accessToken: string;
  accountId: string;
  planType: string | null;
};

function parseArgs(argv: string[]): SmokeArgs {
  return {
    live: argv.includes("--live") || process.env.DAYTONA_LIVE_SMOKE === "1",
    requireLive: argv.includes("--require-live"),
    keepSandbox: argv.includes("--keep-sandbox") || process.env.DAYTONA_KEEP_SANDBOX === "1",
    prepareOnly: argv.includes("--prepare-only") || process.env.DAYTONA_PREPARE_ONLY === "1",
    computerUseProof:
      argv.includes("--computer-use-proof") || process.env.DAYTONA_COMPUTER_USE_PROOF === "1",
  };
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function fail(message: string): never {
  throw new Error(message);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandOutput(result: { result?: string; artifacts?: { stdout?: string } }): string {
  const resultText = String(result.result ?? "");
  const stdout = String(result.artifacts?.stdout ?? "");
  return resultText || stdout;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findNestedNumberField(value: unknown, field: string, depth = 0): number | null {
  if (depth > 4) return null;
  const record = asRecord(value);
  if (!record) return null;
  const direct = readNumber(record[field]);
  if (direct !== null) return direct;
  for (const nested of Object.values(record)) {
    const found = findNestedNumberField(nested, field, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function estimateImagePayloadSize(value: unknown, depth = 0): number | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") return value.length > 0 ? Buffer.byteLength(value, "utf8") : null;
  if (Buffer.isBuffer(value)) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const size = estimateImagePayloadSize(entry, depth + 1);
      if (size !== null) return size;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ["screenshot", "image", "data", "base64", "content", "buffer"]) {
    const size = estimateImagePayloadSize(record[key], depth + 1);
    if (size !== null) return size;
  }
  for (const nested of Object.values(record)) {
    const size = estimateImagePayloadSize(nested, depth + 1);
    if (size !== null) return size;
  }
  return null;
}

function summarizeComputerUseScreenshot(value: unknown): {
  screenshot_width: number | null;
  screenshot_height: number | null;
  screenshot_size_bytes: number | null;
  screenshot_data_present: boolean;
  screenshot_result_keys: string[];
} {
  const record = asRecord(value);
  const sizeBytes =
    findNestedNumberField(value, "sizeBytes") ??
    findNestedNumberField(value, "size_bytes") ??
    estimateImagePayloadSize(value);
  return {
    screenshot_width: findNestedNumberField(value, "width"),
    screenshot_height: findNestedNumberField(value, "height"),
    screenshot_size_bytes: sizeBytes,
    screenshot_data_present: typeof sizeBytes === "number" && sizeBytes > 0,
    screenshot_result_keys: record ? Object.keys(record).sort() : [],
  };
}

function readCodexAuthJsonPath(): string | null {
  const explicit = readEnv("POLYNET_DAYTONA_SMOKE_CODEX_AUTH_JSON");
  if (explicit) return explicit;
  const codexHome = readEnv("CODEX_HOME");
  if (codexHome) {
    const candidate = path.join(codexHome, "auth.json");
    if (existsSync(candidate)) return candidate;
  }
  const fallback = path.join(os.homedir(), ".codex", "auth.json");
  return existsSync(fallback) ? fallback : null;
}

function readSmokeChatgptAuth(): SmokeChatgptAuth | null {
  const envAccessToken = readEnv("POLYNET_DAYTONA_SMOKE_CHATGPT_ACCESS_TOKEN");
  const envAccountId = readEnv("POLYNET_DAYTONA_SMOKE_CHATGPT_ACCOUNT_ID");
  if (envAccessToken && envAccountId) {
    return {
      accessToken: envAccessToken,
      accountId: envAccountId,
      planType: readEnv("POLYNET_DAYTONA_SMOKE_CHATGPT_PLAN_TYPE") || null,
    };
  }

  const authPath = readCodexAuthJsonPath();
  if (!authPath) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(authPath, "utf8"));
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  const tokens = asRecord(root?.tokens);
  const accessToken =
    readString(tokens?.access_token) ||
    readString(tokens?.accessToken) ||
    readString(root?.access_token) ||
    readString(root?.accessToken);
  const accountId =
    readString(tokens?.account_id) ||
    readString(tokens?.accountId) ||
    readString(root?.account_id) ||
    readString(root?.accountId);
  if (!accessToken || !accountId) return null;
  return {
    accessToken,
    accountId,
    planType:
      readString(tokens?.plan_type) ||
      readString(tokens?.planType) ||
      readString(root?.plan_type) ||
      readString(root?.planType) ||
      null,
  };
}

function readSmokeWorkerAuthToken(): string {
  return (
    readEnv("POLYNET_DAYTONA_SMOKE_WORKER_AUTH_TOKEN") ||
    `polynet-daytona-smoke-${randomBytes(18).toString("hex")}`
  );
}

function readPreviewExpirySeconds(): number {
  const parsed = Number.parseInt(readEnv("POLYNET_DAYTONA_SMOKE_PREVIEW_SECONDS"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
}

async function createWorktreeTarball(tmpDir: string): Promise<string> {
  const tarballPath = path.join(tmpDir, "polynet-daytona-live-smoke.tgz");
  await execFileAsync(
    "tar",
    [
      "-czf",
      tarballPath,
      "--exclude=./.git",
      "--exclude=./node_modules",
      "--exclude=./apps/web/node_modules",
      "--exclude=./dist",
      "--exclude=./coverage",
      "--exclude=./tmp",
      "--exclude=./.convex",
      "--exclude=./.vercel",
      "--exclude=./.env",
      "--exclude=./.env.*",
      "--exclude=./*.pem",
      "--exclude=./*.key",
      ".",
    ],
    {
      cwd: ROOT_DIR,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return tarballPath;
}

async function loadDaytona(): Promise<{ Daytona: new (config?: Record<string, unknown>) => DaytonaClient }> {
  try {
    return (await import("@daytona/sdk")) as {
      Daytona: new (config?: Record<string, unknown>) => DaytonaClient;
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "unknown error");
    fail(`daytona_sdk_unavailable: ${message}`);
  }
}

function buildDaytonaConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const apiKey = readEnv("DAYTONA_API_KEY");
  const apiUrl = readEnv("DAYTONA_API_URL");
  const target = readEnv("DAYTONA_TARGET");
  const jwtToken = readEnv("DAYTONA_JWT_TOKEN");
  const organizationId = readEnv("DAYTONA_ORGANIZATION_ID");
  if (apiKey) config.apiKey = apiKey;
  if (apiUrl) config.apiUrl = apiUrl;
  if (target) config.target = target;
  if (jwtToken) config.jwtToken = jwtToken;
  if (organizationId) config.organizationId = organizationId;
  return config;
}

async function runRemote(
  sandbox: DaytonaSandbox,
  command: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutSeconds?: number;
    allowFailure?: boolean;
  },
): Promise<{
  exitCode: number;
  output: string;
}> {
  let result: {
    exitCode: number;
    result?: string;
    artifacts?: {
      stdout?: string;
    };
  };
  try {
    result = await sandbox.process.executeCommand(
      command,
      options?.cwd,
      options?.env,
      options?.timeoutSeconds ?? 60,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "unknown error");
    fail(
      [
        "daytona_remote_command_error",
        `command=${command.slice(0, 500)}`,
        `message=${message}`,
      ].join("\n"),
    );
  }
  const output = commandOutput(result);
  if (!options?.allowFailure && result.exitCode !== 0) {
    fail(
      [
        "daytona_remote_command_failed",
        `exit_code=${result.exitCode}`,
        `command=${command.slice(0, 300)}`,
        `output=${output.slice(0, 4000)}`,
      ].join("\n"),
    );
  }
  return { exitCode: result.exitCode, output };
}

async function runRemoteBash(
  sandbox: DaytonaSandbox,
  script: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutSeconds?: number;
    allowFailure?: boolean;
  },
): Promise<{
  exitCode: number;
  output: string;
}> {
  return await runRemote(sandbox, `bash -lc ${shellQuote(script)}`, options);
}

function logStage(stage: string): void {
  process.stderr.write(`daytona_live_smoke_stage: ${stage}\n`);
}

function shouldRequireSnapshot(): boolean {
  return readEnv("POLYNET_DAYTONA_REQUIRE_SNAPSHOT") === "1";
}

function shouldRunFullInstall(): boolean {
  return readEnv("POLYNET_DAYTONA_SMOKE_INSTALL_MODE").toLowerCase() === "full";
}

function readImageResource(name: string): number | undefined {
  const value = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function ensureSandboxStarted(sandbox: DaytonaSandbox, timeoutSeconds: number): Promise<void> {
  if (sandbox.state !== "started" && typeof sandbox.start === "function") {
    await sandbox.start(timeoutSeconds);
    return;
  }
  await sandbox.waitUntilStarted?.(timeoutSeconds);
}

async function waitForWorkerHealth(params: {
  sandbox: DaytonaSandbox;
  token: string;
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let lastOutput = "";
  while (Date.now() - startedAt < params.timeoutMs) {
    const result = await runRemote(
      params.sandbox,
      `curl -sS -H ${shellQuote(`Authorization: Bearer ${params.token}`)} http://127.0.0.1:${WORKER_PORT}/healthz || true`,
      { timeoutSeconds: 10, allowFailure: true },
    );
    lastOutput = result.output.trim();
    if (lastOutput.startsWith("{")) {
      const parsed = JSON.parse(lastOutput) as Record<string, unknown>;
      if (parsed.ok === true) return parsed;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const logs = await runRemote(
    params.sandbox,
    `tail -240 ${shellQuote(REMOTE_WORKER_LOG)} 2>/dev/null || true`,
    { timeoutSeconds: 10, allowFailure: true },
  );
  fail(
    [
      "daytona_worker_health_timeout",
      `last_health=${lastOutput.slice(0, 2000)}`,
      `worker_log=${logs.output.slice(0, 6000)}`,
    ].join("\n"),
  );
}

function requireConfiguredLive(args: SmokeArgs): {
  existingSandboxId: string | null;
} {
  const existingSandboxId =
    readEnv("POLYNET_DAYTONA_LIVE_SANDBOX_ID") || readEnv("DAYTONA_SANDBOX_ID") || null;
  const hasApiCredentials = Boolean(readEnv("DAYTONA_API_KEY") || readEnv("DAYTONA_JWT_TOKEN"));
  if (args.live && !hasApiCredentials) {
    fail("DAYTONA_API_KEY or DAYTONA_JWT_TOKEN is required for --live.");
  }
  if (args.live && readEnv("DAYTONA_JWT_TOKEN") && !readEnv("DAYTONA_ORGANIZATION_ID")) {
    fail("DAYTONA_ORGANIZATION_ID is required when DAYTONA_JWT_TOKEN is used.");
  }
  return { existingSandboxId };
}

async function startWorkerInDaytona(params: {
  sandbox: DaytonaSandbox;
  token: string;
}): Promise<void> {
  const codexPackage = readEnv("POLYNET_DAYTONA_SMOKE_CODEX_PACKAGE") || DEFAULT_CODEX_PACKAGE;
  const workerEnv: Record<string, string> = {
    POLYNET_CODEX_WORKSPACE_HOST: "daytona",
    POLYNET_DAYTONA_WORKSPACE_ROOT: "/home/daytona",
    POLYNET_CODEX_WORKER_HOST: "127.0.0.1",
    POLYNET_CODEX_WORKER_PORT: String(WORKER_PORT),
    POLYNET_CODEX_WORKER_AUTH_TOKEN: params.token,
    POLYNET_CODEX_WORKER_CODEX_BIN: `${REMOTE_ROOT}/node_modules/.bin/codex`,
    POLYNET_CODEX_WORKER_MODEL: "gpt-5.5",
    POLYNET_DEPLOYMENT_KIND: "staging",
    CONVEX_DEPLOYMENT: "dev:quick-porcupine-949",
    DAYTONA_SANDBOX_ID: params.sandbox.id,
  };
  for (const secretName of ["CODEX_ACCESS_TOKEN", "OPENAI_API_KEY"]) {
    const value = readEnv(secretName);
    if (value) workerEnv[secretName] = value;
  }
  const envBlock = Object.entries(workerEnv)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");

  logStage("runtime_preflight");
  await runRemoteBash(
    params.sandbox,
    ["set -euo pipefail", "node --version", "npm --version"].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 30 },
  );

  logStage("dependencies");
  if (shouldRunFullInstall()) {
    await runRemoteBash(
      params.sandbox,
      [
        "set -euo pipefail",
        "if test -d node_modules; then",
        "  echo node_modules_present",
        "else",
        "  npm ci --omit=dev --ignore-scripts --no-audit --no-fund",
        "fi",
      ].join("\n"),
      { cwd: REMOTE_ROOT, timeoutSeconds: 900 },
    );
  } else {
    await runRemoteBash(
      params.sandbox,
      [
        "set -euo pipefail",
        "mkdir -p node_modules",
        "echo minimal_dependency_mode",
      ].join("\n"),
      { cwd: REMOTE_ROOT, timeoutSeconds: 30 },
    );
  }

  logStage("codex_cli");
  await runRemoteBash(
    params.sandbox,
    [
      "set -euo pipefail",
      "if test ! -x node_modules/.bin/codex; then",
      `  npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund ${shellQuote(codexPackage)}`,
      "fi",
      "test -x node_modules/.bin/codex",
      "node_modules/.bin/codex --version",
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 300 },
  );

  logStage("worker_start");
  await runRemoteBash(
    params.sandbox,
    [
      "set -euo pipefail",
      `if test -f ${shellQuote(REMOTE_WORKER_PID)}; then kill "$(cat ${shellQuote(REMOTE_WORKER_PID)})" 2>/dev/null || true; rm -f ${shellQuote(REMOTE_WORKER_PID)}; fi`,
      `nohup env ${envBlock} bash scripts/run_polynet_codex_worker_service_local.sh > ${shellQuote(REMOTE_WORKER_LOG)} 2>&1 & echo $! > ${shellQuote(REMOTE_WORKER_PID)}`,
      "sleep 1",
      `test -s ${shellQuote(REMOTE_WORKER_PID)}`,
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 30 },
  );
}

async function runWorkspaceProbe(params: {
  sandbox: DaytonaSandbox;
  token: string;
}): Promise<Record<string, unknown>> {
  const body = JSON.stringify({
    run_id: `daytona_live_smoke_${Date.now()}`,
    sandbox_name: "polynet-daytona-live-smoke",
    command:
      "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && printf daytona-live > daytona-live-marker.txt && cat daytona-live-marker.txt",
    command_timeout_seconds: 60,
    destroy_after_run: false,
  });
  const result = await runRemote(
    params.sandbox,
    [
      "curl -sS",
      "-X POST",
      `-H ${shellQuote(`Authorization: Bearer ${params.token}`)}`,
      `-H ${shellQuote("Content-Type: application/json")}`,
      `--data ${shellQuote(body)}`,
      `http://127.0.0.1:${WORKER_PORT}/v1/workspace/probe`,
    ].join(" "),
    { timeoutSeconds: 90 },
  );
  return JSON.parse(result.output) as Record<string, unknown>;
}

async function runRealCodexTurnProof(params: {
  sandbox: DaytonaSandbox;
  token: string;
  chatgptAuth: SmokeChatgptAuth;
}): Promise<Record<string, unknown>> {
  const command = `printf ${shellQuote(TURN_PROOF_MARKER)} > ${shellQuote(TURN_PROOF_FILE)} && cat ${shellQuote(TURN_PROOF_FILE)}`;
  const body = JSON.stringify({
    run_id: `daytona_live_turn_${Date.now()}`,
    model: "gpt-5.5",
    sandbox_name: "polynet-daytona-live-turn-smoke",
    destroy_after_run: false,
    command_timeout_seconds: 90,
    developer_instructions: [
      "POLYNET_DAYTONA_TURN_SENTINEL: this is a staging-only Daytona real-turn proof.",
      `After the required workspace tool proof succeeds, include the exact text ${TURN_PROOF_ASSISTANT_SENTINEL} in the final answer.`,
      "Do not mention Daytona, hosting vendors, or internal smoke-test infrastructure.",
    ].join(" "),
    prompt: [
      "Call workspace_bash exactly once.",
      `Use this exact command: ${command}`,
      `After the tool returns, report the marker contents and include ${TURN_PROOF_ASSISTANT_SENTINEL}.`,
      "Do not call any other tools.",
    ].join(" "),
    chatgpt_auth: {
      access_token: params.chatgptAuth.accessToken,
      chatgpt_account_id: params.chatgptAuth.accountId,
      chatgpt_plan_type: params.chatgptAuth.planType,
    },
  });
  const result = await runRemote(
    params.sandbox,
    [
      "curl -sS",
      "-X POST",
      `-H ${shellQuote(`Authorization: Bearer ${params.token}`)}`,
      `-H ${shellQuote("Content-Type: application/json")}`,
      `--data ${shellQuote(body)}`,
      `http://127.0.0.1:${WORKER_PORT}/v1/codex/turn`,
    ].join(" "),
    { timeoutSeconds: 240 },
  );
  return JSON.parse(result.output) as Record<string, unknown>;
}

async function runComputerUseProof(sandbox: DaytonaSandbox): Promise<Record<string, unknown>> {
  const computerUse = sandbox.computerUse;
  if (!computerUse || typeof computerUse.start !== "function") {
    fail("daytona_computer_use_unavailable: sandbox.computerUse.start was not available.");
  }
  let started = false;
  let stopped = false;
  let status: Record<string, unknown> | null = null;
  let screenshotMethod: "takeCompressed" | "takeFullScreen" | null = null;
  let screenshotRaw: unknown = null;
  try {
    logStage("computer_use_start");
    await computerUse.start();
    started = true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (typeof computerUse.getStatus === "function") {
      const statusRaw = await computerUse.getStatus();
      status = asRecord(statusRaw);
    }

    logStage("computer_use_screenshot");
    if (typeof computerUse.screenshot?.takeCompressed === "function") {
      screenshotMethod = "takeCompressed";
      screenshotRaw = await computerUse.screenshot.takeCompressed({
        format: "jpeg",
        quality: 70,
        scale: 0.5,
        showCursor: false,
      });
    } else if (typeof computerUse.screenshot?.takeFullScreen === "function") {
      screenshotMethod = "takeFullScreen";
      screenshotRaw = await computerUse.screenshot.takeFullScreen(false);
    } else {
      fail("daytona_computer_use_screenshot_unavailable: no supported screenshot method found.");
    }
  } finally {
    if (typeof computerUse.stop === "function") {
      try {
        logStage("computer_use_stop");
        await computerUse.stop();
        stopped = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "stop failed");
        process.stderr.write(`daytona_computer_use_stop_warning: ${message}\n`);
      }
    }
  }

  const screenshot = summarizeComputerUseScreenshot(screenshotRaw);
  if (!screenshot.screenshot_data_present) {
    fail(
      [
        "daytona_computer_use_screenshot_empty",
        `method=${String(screenshotMethod)}`,
        `keys=${screenshot.screenshot_result_keys.join(",")}`,
      ].join("\n"),
    );
  }

  return {
    started,
    stopped,
    status_available: Boolean(status),
    status_keys: status ? Object.keys(status).sort() : [],
    screenshot_method: screenshotMethod,
    ...screenshot,
  };
}

async function createDaytonaSmokeSandbox(params: {
  daytona: DaytonaClient;
  snapshot: string;
  image: string;
  reusableForUi: boolean;
}): Promise<DaytonaSandbox> {
  const baseParams = {
    language: "typescript",
    name: `polynet-codex-smoke-${Date.now()}`,
    labels: {
      app: "polynet",
      purpose: "codex-runtime-live-smoke",
      environment: "staging-spike",
    },
    public: DAYTONA_RUNTIME_POLICY.daytonaSandbox.publicPreview,
    autoStopInterval: params.reusableForUi
      ? readPositiveIntegerEnv("POLYNET_DAYTONA_REUSABLE_AUTO_STOP_MINUTES", 30)
      : DAYTONA_RUNTIME_POLICY.daytonaSandbox.autoStopIntervalMinutes,
    ephemeral: params.reusableForUi ? false : DAYTONA_RUNTIME_POLICY.daytonaSandbox.ephemeral,
  };
  if (params.image) {
    logStage("image_sandbox_create");
    return await params.daytona.create(
      {
        ...baseParams,
        image: params.image,
        resources: {
          cpu:
            readImageResource("POLYNET_DAYTONA_SMOKE_CPU") ??
            DAYTONA_RUNTIME_POLICY.daytonaSandbox.defaultResources.cpu,
          memory:
            readImageResource("POLYNET_DAYTONA_SMOKE_MEMORY") ??
            DAYTONA_RUNTIME_POLICY.daytonaSandbox.defaultResources.memory,
          disk:
            readImageResource("POLYNET_DAYTONA_SMOKE_DISK") ??
            DAYTONA_RUNTIME_POLICY.daytonaSandbox.defaultResources.disk,
        },
      },
      { timeout: 300 },
    );
  }
  try {
    return await params.daytona.create(
      {
        ...baseParams,
        ...(params.snapshot ? { snapshot: params.snapshot } : {}),
      },
      { timeout: 180 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "sandbox create failed");
    if (!params.snapshot || shouldRequireSnapshot() || !/snapshot/i.test(message)) {
      throw error;
    }
    logStage("snapshot_unavailable_retry_without_snapshot");
    return await params.daytona.create(baseParams, { timeout: 180 });
  }
}

function assertPreparedSmokeResult(params: {
  health: Record<string, unknown>;
  probe: Record<string, unknown>;
}): void {
  const workspaceHost = params.health.workspace_host as Record<string, unknown> | undefined;
  const codex = params.health.codex as Record<string, unknown> | undefined;
  const executionPolicy = params.health.execution_policy as Record<string, unknown> | undefined;
  const nativeCodex = executionPolicy?.native_codex as Record<string, unknown> | undefined;
  const workspaceToolAccess = executionPolicy?.workspace_tool_access as
    | Record<string, unknown>
    | undefined;
  const turnSandboxPolicy = nativeCodex?.turn_sandbox_policy as
    | Record<string, unknown>
    | undefined;
  if (workspaceHost?.id !== "daytona") fail("health workspace_host.id was not daytona.");
  if (workspaceHost?.configured !== true) fail("health workspace_host.configured was not true.");
  if (codex?.initialized !== true) fail("health codex.initialized was not true.");
  if (codex?.model !== "gpt-5.5") fail(`health codex.model was ${String(codex?.model)}.`);
  if (nativeCodex?.thread_approval_policy !== "never") {
    fail("health native Codex thread approval policy was not never.");
  }
  if (nativeCodex?.thread_sandbox !== "workspace-write") {
    fail("health native Codex thread sandbox was not workspace-write.");
  }
  if (nativeCodex?.turn_approval_policy !== "never") {
    fail("health native Codex turn approval policy was not never.");
  }
  if (turnSandboxPolicy?.type !== "workspaceWrite" || turnSandboxPolicy?.network_access !== false) {
    fail("health native Codex turn sandbox policy was not workspaceWrite with network disabled.");
  }
  if (workspaceToolAccess?.shell_tool !== "workspace_bash" || workspaceToolAccess?.access !== "full") {
    fail("health workspace tool access did not report full workspace_bash access.");
  }
  if (params.probe.ok !== true) fail(`workspace probe failed: ${JSON.stringify(params.probe)}`);
  if (params.probe.workspace_host_id !== "daytona") {
    fail("workspace probe did not execute through the Daytona workspace host.");
  }
  if (params.probe.workspace_root !== "/home/daytona") {
    fail(`workspace probe root was ${String(params.probe.workspace_root)} instead of /home/daytona.`);
  }
}

function assertLiveSmokeResult(params: {
  health: Record<string, unknown>;
  probe: Record<string, unknown>;
  turn: Record<string, unknown>;
}): void {
  assertPreparedSmokeResult({ health: params.health, probe: params.probe });

  if (params.turn.ok !== true) fail(`real Codex turn failed: ${JSON.stringify(params.turn)}`);
  if (params.turn.workspace_host_id !== "daytona") {
    fail("real Codex turn did not execute through the Daytona workspace host.");
  }
  if (params.turn.workspace_root !== "/home/daytona") {
    fail(`real Codex turn workspace root was ${String(params.turn.workspace_root)}.`);
  }
  if (params.turn.model_id !== "gpt-5.5") {
    fail(`real Codex turn model was ${String(params.turn.model_id)}.`);
  }
  const toolCalls = Array.isArray(params.turn.tool_calls) ? params.turn.tool_calls : [];
  if (toolCalls.length !== 1) {
    fail(`real Codex turn expected one workspace_bash call, saw ${toolCalls.length}.`);
  }
  const toolCall = asRecord(toolCalls[0]);
  if (toolCall?.ok !== true) fail(`real Codex turn workspace_bash call failed: ${JSON.stringify(toolCall)}`);
  const command = readString(toolCall?.command);
  const stdoutPreview = readString(toolCall?.stdout_preview);
  if (!command.includes(TURN_PROOF_FILE) || !command.includes(TURN_PROOF_MARKER)) {
    fail("real Codex turn workspace_bash command did not contain the expected marker file proof.");
  }
  if (!stdoutPreview.includes(TURN_PROOF_MARKER)) {
    fail("real Codex turn workspace_bash output did not contain the marker.");
  }
  const assistantText = readString(params.turn.assistant_text);
  if (!assistantText.includes(TURN_PROOF_ASSISTANT_SENTINEL)) {
    fail("real Codex turn assistant text did not include the PolyNet sentinel behavior.");
  }
  if (!assistantText.includes(TURN_PROOF_MARKER)) {
    fail("real Codex turn assistant text did not report the marker contents.");
  }
}

async function cleanupSandbox(params: {
  daytona: DaytonaClient;
  sandbox: DaytonaSandbox;
  createdSandbox: boolean;
  keepSandbox: boolean;
}): Promise<void> {
  if (params.keepSandbox) return;
  await runRemote(
    params.sandbox,
    `if test -f ${shellQuote(REMOTE_WORKER_PID)}; then kill "$(cat ${shellQuote(REMOTE_WORKER_PID)})" 2>/dev/null || true; fi`,
    { timeoutSeconds: 10, allowFailure: true },
  ).catch(() => undefined);
  if (!params.createdSandbox) return;
  if (typeof params.sandbox.delete === "function") {
    await params.sandbox.delete(120);
    return;
  }
  if (typeof params.daytona.delete === "function") {
    await params.daytona.delete(params.sandbox, 120);
  }
}

export async function runDaytonaCodexRuntimeLiveSmoke(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (!args.live) {
    if (args.requireLive) fail("--require-live was set but --live/DAYTONA_LIVE_SMOKE=1 was not.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: "daytona_live_smoke_not_requested",
          run_with: "DAYTONA_LIVE_SMOKE=1 npm run smoke:daytona-codex-runtime-live -- --live",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (args.prepareOnly && !args.keepSandbox) {
    fail("--prepare-only requires --keep-sandbox because the prepared sandbox is meant for UI routing.");
  }

  const { existingSandboxId } = requireConfiguredLive(args);
  const chatgptAuth = args.prepareOnly || args.computerUseProof ? null : readSmokeChatgptAuth();
  if (!args.prepareOnly && !args.computerUseProof && !chatgptAuth) {
    fail(
      [
        "chatgpt_auth_unavailable_for_real_turn",
        "Set POLYNET_DAYTONA_SMOKE_CHATGPT_ACCESS_TOKEN and POLYNET_DAYTONA_SMOKE_CHATGPT_ACCOUNT_ID,",
        "or run from a machine with ~/.codex/auth.json containing tokens.access_token and tokens.account_id.",
      ].join(" "),
    );
  }
  const { Daytona } = await loadDaytona();
  const daytona = new Daytona(buildDaytonaConfig());
  const snapshot = readEnv("DAYTONA_SNAPSHOT");
  const image = readEnv("POLYNET_DAYTONA_SMOKE_IMAGE");
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "polynet-daytona-smoke-"));
  const token = readSmokeWorkerAuthToken();
  let sandbox: DaytonaSandbox | null = null;
  let createdSandbox = false;
  try {
    sandbox = existingSandboxId
      ? await daytona.get(existingSandboxId)
      : await createDaytonaSmokeSandbox({
          daytona,
          snapshot,
          image,
          reusableForUi: args.prepareOnly,
        });
    createdSandbox = !existingSandboxId;
    await ensureSandboxStarted(sandbox, 180);

    if (args.computerUseProof) {
      const computerUse = await runComputerUseProof(sandbox);
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "computer_use_proof",
            sandbox_id: sandbox.id,
            created_sandbox: createdSandbox,
            kept_sandbox: args.keepSandbox,
            computer_use: computerUse,
          },
          null,
          2,
        ),
      );
      return;
    }

    const tarball = await createWorktreeTarball(tmpDir);
    await sandbox.fs.uploadFile(tarball, REMOTE_TARBALL, 180);
    logStage("worktree_upload");
    await runRemoteBash(
      sandbox,
      [
        "set -euo pipefail",
        `mkdir -p ${shellQuote(REMOTE_ROOT)}`,
        `find ${shellQuote(REMOTE_ROOT)} -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .polynet-codex-home -exec rm -rf {} +`,
        `tar -xzf ${shellQuote(REMOTE_TARBALL)} -C ${shellQuote(REMOTE_ROOT)}`,
      ].join("\n"),
      { timeoutSeconds: 180 },
    );
    await startWorkerInDaytona({ sandbox, token });
    const health = await waitForWorkerHealth({ sandbox, token, timeoutMs: 120_000 });
    const probe = await runWorkspaceProbe({ sandbox, token });
    const turn = args.prepareOnly
      ? null
      : await runRealCodexTurnProof({ sandbox, token, chatgptAuth: chatgptAuth as SmokeChatgptAuth });
    if (turn) {
      assertLiveSmokeResult({ health, probe, turn });
    } else {
      assertPreparedSmokeResult({ health, probe });
    }

    let previewUrl: string | null = null;
    if (typeof sandbox.getSignedPreviewUrl === "function") {
      const preview = await sandbox.getSignedPreviewUrl(WORKER_PORT, readPreviewExpirySeconds());
      previewUrl = readString(preview.url) || null;
    }
    const codex = health.codex as Record<string, unknown> | undefined;

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: args.prepareOnly ? "prepare_only" : "live_turn",
          sandbox_id: sandbox.id,
          created_sandbox: createdSandbox,
          kept_sandbox: args.keepSandbox,
          workspace_host_id: probe.workspace_host_id,
          workspace_root: probe.workspace_root,
          codex_initialized: codex?.initialized === true,
          codex_model: codex?.model ?? null,
          execution_policy: health.execution_policy ?? null,
          ...(turn
            ? {
                real_turn: {
                  ok: turn.ok === true,
                  workspace_host_id: turn.workspace_host_id ?? null,
                  workspace_root: turn.workspace_root ?? null,
                  model_id: turn.model_id ?? null,
                  tool_call_count: Array.isArray(turn.tool_calls) ? turn.tool_calls.length : 0,
                  assistant_sentinel_seen: readString(turn.assistant_text).includes(
                    TURN_PROOF_ASSISTANT_SENTINEL,
                  ),
                  marker_seen: readString(turn.assistant_text).includes(TURN_PROOF_MARKER),
                },
              }
            : {
                set_convex_env_command:
                  `CONVEX_DEPLOYMENT=dev:quick-porcupine-949 npx convex env set POLYNET_DAYTONA_DIRECT_SANDBOX_ID ${sandbox.id}`,
              }),
          signed_preview_url_available: Boolean(previewUrl),
          ...(args.keepSandbox && previewUrl ? { preview_url: previewUrl } : {}),
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
    if (sandbox) {
      await cleanupSandbox({
        daytona,
        sandbox,
        createdSandbox,
        keepSandbox: args.keepSandbox,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error ?? "cleanup failed");
        process.stderr.write(`daytona_live_smoke_cleanup_warning: ${message}\n`);
      });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDaytonaCodexRuntimeLiveSmoke().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error ?? "unknown error");
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
