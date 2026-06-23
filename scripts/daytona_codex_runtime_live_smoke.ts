import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DAYTONA_CODEX_REMOTE_ROOT,
  DAYTONA_CODEX_WORKER_PORT,
  DAYTONA_CODEX_WORKSPACE_ROOT,
  DAYTONA_RUNTIME_POLICY,
  defaultDaytonaProviderEphemeralForLifecycleMode,
} from "../shared/daytonaCodexRuntimePolicy.ts";

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WORKER_PORT = DAYTONA_CODEX_WORKER_PORT;
const REMOTE_ROOT = DAYTONA_CODEX_REMOTE_ROOT;
const REMOTE_WORKSPACE_ROOT = DAYTONA_CODEX_WORKSPACE_ROOT;
const DEFAULT_CODEX_MODEL_ID = DAYTONA_RUNTIME_POLICY.nativeCodex.defaultModelId;
const REMOTE_TARBALL = "/home/daytona/polynet-codex-runtime-smoke.tgz";
const REMOTE_WORKER_LOG = "/tmp/polynet-codex-worker.log";
const REMOTE_WORKER_PID = "/tmp/polynet-codex-worker.pid";
const DEFAULT_CODEX_PACKAGE = "@openai/codex@0.141.0";
const TURN_PROOF_FILE = `${REMOTE_WORKSPACE_ROOT}/polynet-daytona-turn-proof.txt`;
const TURN_PROOF_MARKER = "daytona-turn-proof-context-ok";
const TURN_PROOF_ASSISTANT_SENTINEL = "daytona-context-ok";
const NATIVE_WORKSPACE_PROBE_FILE = `${REMOTE_WORKSPACE_ROOT}/codex-native-probe.txt`;
const NATIVE_WORKSPACE_PROBE_MARKER = "OK";
const NATIVE_WORKSPACE_PROBE_SENTINEL = "codex-native-workspace-probe-ok";
const INTERACTIVE_PREVIEW_PROBE_PORT = 4173;
const INTERACTIVE_PREVIEW_PROBE_FILE = `${REMOTE_WORKSPACE_ROOT}/index.html`;
const INTERACTIVE_PREVIEW_PROBE_SENTINEL = "codex-interactive-preview-probe-ok";
const FULL_ACCESS_CANARY_ENV_NAME = "POLYNET_FULL_ACCESS_CANARY_SECRET";
const FULL_ACCESS_CANARY_ENV_VALUE = "polynet-full-access-env-canary-visible";
const FULL_ACCESS_CANARY_FILE = `${REMOTE_ROOT}/.polynet-full-access-canary.txt`;
const FULL_ACCESS_CANARY_FILE_VALUE = "polynet-full-access-file-canary-visible";

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
  nativeWorkspaceProbe: boolean;
  interactivePreviewProbe: boolean;
  installBubblewrap: boolean;
  codexFullAccess: boolean;
};

type SmokeChatgptAuth = {
  accessToken: string;
  accountId: string;
  planType: string | null;
};

function parseArgs(argv: string[]): SmokeArgs {
  const forceWorkspaceWrite =
    argv.includes("--codex-workspace-write") ||
    process.env.POLYNET_DAYTONA_SMOKE_CODEX_WORKSPACE_WRITE === "1";
  return {
    live: argv.includes("--live") || process.env.DAYTONA_LIVE_SMOKE === "1",
    requireLive: argv.includes("--require-live"),
    keepSandbox: argv.includes("--keep-sandbox") || process.env.DAYTONA_KEEP_SANDBOX === "1",
    prepareOnly: argv.includes("--prepare-only") || process.env.DAYTONA_PREPARE_ONLY === "1",
    computerUseProof:
      argv.includes("--computer-use-proof") || process.env.DAYTONA_COMPUTER_USE_PROOF === "1",
    nativeWorkspaceProbe:
      argv.includes("--native-workspace-probe") ||
      process.env.POLYNET_DAYTONA_NATIVE_WORKSPACE_PROBE === "1",
    interactivePreviewProbe:
      argv.includes("--interactive-preview-probe") ||
      process.env.POLYNET_DAYTONA_INTERACTIVE_PREVIEW_PROBE === "1",
    installBubblewrap:
      argv.includes("--install-bubblewrap") ||
      process.env.POLYNET_DAYTONA_SMOKE_INSTALL_BUBBLEWRAP === "1",
    codexFullAccess: !forceWorkspaceWrite,
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

function previewTextForProbe(value: unknown, max = 500): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readString).filter(Boolean);
}

function extractYesNoLine(text: string, label: string): "yes" | "no" | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(?:^|\\n)${escaped}\\s*=\\s*(yes|no)\\b`, "i"));
  if (!match) return null;
  return match[1]?.toLowerCase() === "yes" ? "yes" : "no";
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

async function runNativeSandboxPrereqProbe(
  sandbox: DaytonaSandbox,
): Promise<Record<string, unknown>> {
  logStage("native_sandbox_prereq_probe");
  const script = [
    "set -euo pipefail",
    `mkdir -p ${shellQuote(REMOTE_WORKSPACE_ROOT)}`,
    "node <<'NODE'",
    "const { spawnSync } = require('node:child_process');",
    "const { readFileSync, writeFileSync } = require('node:fs');",
    "function read(path) { try { return readFileSync(path, 'utf8').trim(); } catch { return null; } }",
    "function run(command, timeout = 10000) {",
    "  const result = spawnSync('/bin/sh', ['-lc', command], { encoding: 'utf8', timeout });",
    "  return {",
    "    exit_code: result.status === null ? -1 : result.status,",
    "    signal: result.signal || null,",
    "    stdout: String(result.stdout || '').trim().slice(0, 2000),",
    "    stderr: String(result.stderr || '').trim().slice(0, 2000),",
    "    error: result.error ? String(result.error.message || result.error).slice(0, 1000) : null,",
    "  };",
    "}",
    "const bwrapPath = run('command -v bwrap || true').stdout || null;",
    "const unsharePath = run('command -v unshare || true').stdout || null;",
    "const out = {",
    "  os_release_pretty_name: read('/etc/os-release')?.split('\\n').find((line) => line.startsWith('PRETTY_NAME='))?.replace(/^PRETTY_NAME=/, '').replace(/^\"|\"$/g, '') || null,",
    "  kernel: run('uname -a').stdout || null,",
    "  user: run('id').stdout || null,",
    "  bwrap_path: bwrapPath,",
    "  bwrap_mode: bwrapPath ? run('stat -c \"%a %U %G %n\" /usr/bin/bwrap') : null,",
    "  bwrap_version: bwrapPath ? run('bwrap --version') : null,",
    "  unshare_path: unsharePath,",
    "  unprivileged_userns_clone: read('/proc/sys/kernel/unprivileged_userns_clone'),",
    "  apparmor_enabled: read('/sys/module/apparmor/parameters/enabled'),",
    "  apparmor_restrict_unprivileged_userns: read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),",
    "  sudo_noninteractive: run('sudo -n true'),",
    "  apt_get_path: run('command -v apt-get || true').stdout || null,",
    "  workspace_write_probe: run('printf native-sandbox-probe > /home/daytona/workspace/native-sandbox-probe.txt && cat /home/daytona/workspace/native-sandbox-probe.txt'),",
    "  userns_probe: run('unshare -Ur /bin/sh -lc \"id -u\"'),",
    "  bwrap_probe: bwrapPath ? run('bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp /bin/sh -lc \"echo bwrap-ok\"') : null,",
    "};",
    "console.log(JSON.stringify(out));",
    "NODE",
  ].join("\n");
  const result = await runRemoteBash(sandbox, script, { timeoutSeconds: 30 });
  return JSON.parse(result.output) as Record<string, unknown>;
}

async function installBubblewrapInSandbox(sandbox: DaytonaSandbox): Promise<Record<string, unknown>> {
  logStage("native_sandbox_install_bubblewrap");
  const result = await runRemoteBash(
    sandbox,
    [
      "set -euo pipefail",
      "sudo -n true",
      "sudo -n apt-get update",
      "sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y bubblewrap",
      "sudo -n chmod u+s /usr/bin/bwrap",
      "command -v bwrap",
      "stat -c '%a %U %G %n' /usr/bin/bwrap",
      "bwrap --version",
      "bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp /bin/sh -lc 'echo bwrap-ok'",
    ].join("\n"),
    { timeoutSeconds: 300 },
  );
  return {
    ok: true,
    output_preview: result.output.slice(0, 4000),
  };
}

async function writeFullAccessCanaryFile(sandbox: DaytonaSandbox): Promise<void> {
  logStage("full_access_canary_write");
  await runRemoteBash(
    sandbox,
    [
      "set -euo pipefail",
      `printf ${shellQuote(FULL_ACCESS_CANARY_FILE_VALUE)} > ${shellQuote(FULL_ACCESS_CANARY_FILE)}`,
      `chmod 600 ${shellQuote(FULL_ACCESS_CANARY_FILE)} || true`,
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 30 },
  );
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
      const codex = asRecord(parsed.codex);
      if (parsed.ok === true && codex?.initialized === true) return parsed;
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
  codexFullAccess: boolean;
}): Promise<void> {
  const codexPackage = readEnv("POLYNET_DAYTONA_SMOKE_CODEX_PACKAGE") || DEFAULT_CODEX_PACKAGE;
  const workerEnv: Record<string, string> = {
    POLYNET_CODEX_WORKSPACE_HOST: "daytona",
    POLYNET_DAYTONA_WORKSPACE_ROOT: REMOTE_WORKSPACE_ROOT,
    POLYNET_CODEX_WORKER_HOST: "127.0.0.1",
    POLYNET_CODEX_WORKER_PORT: String(WORKER_PORT),
    POLYNET_CODEX_WORKER_AUTH_TOKEN: params.token,
    POLYNET_CODEX_WORKER_CODEX_BIN: `${REMOTE_ROOT}/node_modules/.bin/codex`,
    POLYNET_CODEX_WORKER_MODEL: DEFAULT_CODEX_MODEL_ID,
    POLYNET_DEPLOYMENT_KIND: "staging",
    CONVEX_DEPLOYMENT: "dev:quick-porcupine-949",
    DAYTONA_SANDBOX_ID: params.sandbox.id,
  };
  if (!params.codexFullAccess) {
    workerEnv.POLYNET_DAYTONA_CODEX_SANDBOX_MODE = "workspace-write";
  }
  if (params.codexFullAccess) {
    workerEnv[FULL_ACCESS_CANARY_ENV_NAME] = FULL_ACCESS_CANARY_ENV_VALUE;
  }
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
  codexFullAccess: boolean;
}): Promise<Record<string, unknown>> {
  const fullAccessCommand = [
    `printf ${shellQuote(TURN_PROOF_MARKER)} > ${shellQuote(TURN_PROOF_FILE)}`,
    `printf '\\nworkspace_marker=' && cat ${shellQuote(TURN_PROOF_FILE)}`,
    `printf '\\ncanary_env_seen=' && if printenv ${shellQuote(FULL_ACCESS_CANARY_ENV_NAME)} | grep -Fx ${shellQuote(FULL_ACCESS_CANARY_ENV_VALUE)} >/dev/null; then printf yes; else printf no; fi`,
    `printf '\\ncanary_file_seen=' && if grep -Fx ${shellQuote(FULL_ACCESS_CANARY_FILE_VALUE)} ${shellQuote(FULL_ACCESS_CANARY_FILE)} >/dev/null 2>&1; then printf yes; else printf no; fi`,
    "printf '\\n'",
  ].join(" && ");
  const prompt = params.codexFullAccess
    ? [
        "Use Codex's native shell execution, not workspace_bash.",
        "Run this exact shell command from the workspace root:",
        fullAccessCommand,
        "Then include these exact result lines in the final answer:",
        `${TURN_PROOF_ASSISTANT_SENTINEL}`,
        `workspace_marker=${TURN_PROOF_MARKER}`,
        "canary_env_seen=<yes-or-no-from-the-command>",
        "canary_file_seen=<yes-or-no-from-the-command>",
        "Do not include the canary secret values themselves.",
      ].join(" ")
    : [
        "Use Codex's native workspace tools, not workspace_bash.",
        `Create or overwrite ${TURN_PROOF_FILE} with exactly this text: ${TURN_PROOF_MARKER}`,
        `Read the file back, report the marker contents, and include ${TURN_PROOF_ASSISTANT_SENTINEL}.`,
      ].join(" ");
  const body = JSON.stringify({
    run_id: `daytona_live_turn_${Date.now()}`,
    model: DEFAULT_CODEX_MODEL_ID,
    sandbox_name: "polynet-daytona-live-turn-smoke",
    destroy_after_run: false,
    developer_instructions: [
      "POLYNET_DAYTONA_TURN_SENTINEL: this is a staging-only Daytona real-turn proof.",
      `After the native Codex workspace proof succeeds, include the exact text ${TURN_PROOF_ASSISTANT_SENTINEL} in the final answer.`,
      "Do not mention Daytona, hosting vendors, or internal smoke-test infrastructure.",
    ].join(" "),
    prompt,
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
  const turnResult = JSON.parse(result.output) as Record<string, unknown>;
  const readback = await runRemote(
    params.sandbox,
    `cat ${shellQuote(TURN_PROOF_FILE)}`,
    { timeoutSeconds: 30, allowFailure: true },
  );
  return {
    ...turnResult,
    native_file_readback: readback.output,
    native_file_readback_exit_code: readback.exitCode,
    native_file_readback_ok: readback.output.includes(TURN_PROOF_MARKER),
    full_access_canary_env_seen: extractYesNoLine(
      readString(turnResult.assistant_text),
      "canary_env_seen",
    ),
    full_access_canary_file_seen: extractYesNoLine(
      readString(turnResult.assistant_text),
      "canary_file_seen",
    ),
  };
}

async function runNativeCodexWorkspaceProbe(params: {
  sandbox: DaytonaSandbox;
  token: string;
  chatgptAuth: SmokeChatgptAuth;
}): Promise<Record<string, unknown>> {
  const body = JSON.stringify({
    run_id: `daytona_native_workspace_probe_${Date.now()}`,
    model: DEFAULT_CODEX_MODEL_ID,
    sandbox_name: "polynet-daytona-native-workspace-probe",
    destroy_after_run: false,
    developer_instructions: [
      "POLYNET_DAYTONA_NATIVE_WORKSPACE_PROBE: this is a staging-only Codex native workspace proof.",
      "Use only Codex native workspace capabilities for file and shell work.",
      "Do not call workspace_serve, computer_open_url, computer_screenshot, workspace_bash, or any PolyNet platform tool.",
      `After the native workspace proof succeeds, include the exact text ${NATIVE_WORKSPACE_PROBE_SENTINEL} in the final answer.`,
      "Do not mention Daytona, hosting vendors, or internal smoke-test infrastructure.",
    ].join(" "),
    prompt: [
      "Using Codex native file editing and shell execution only, perform this exact workspace probe.",
      `Create or overwrite ${NATIVE_WORKSPACE_PROBE_FILE} with exactly this text and no trailing explanation: ${NATIVE_WORKSPACE_PROBE_MARKER}`,
      `Read ${NATIVE_WORKSPACE_PROBE_FILE} back.`,
      "Run pwd.",
      `Run ls -la ${NATIVE_WORKSPACE_PROBE_FILE}.`,
      "Do not call workspace_serve.",
      "Do not call computer_open_url or computer_screenshot.",
      "Do not call workspace_bash.",
      "Final answer must contain exactly these labeled lines:",
      NATIVE_WORKSPACE_PROBE_SENTINEL,
      `file_contents=${NATIVE_WORKSPACE_PROBE_MARKER}`,
      "pwd=<current-workspace-directory>",
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
  const turnResult = JSON.parse(result.output) as Record<string, unknown>;
  const readback = await runRemote(
    params.sandbox,
    `cat ${shellQuote(NATIVE_WORKSPACE_PROBE_FILE)}`,
    { timeoutSeconds: 30, allowFailure: true },
  );
  return {
    ...turnResult,
    native_file_readback: readback.output,
    native_file_readback_exit_code: readback.exitCode,
    native_file_readback_ok: readback.output.trim() === NATIVE_WORKSPACE_PROBE_MARKER,
  };
}

function buildInteractivePreviewProbeHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>PolyNet Interactive Preview Probe</title>",
    "  <style>",
    "    body { font-family: system-ui, sans-serif; display: grid; min-height: 100vh; place-items: center; margin: 0; }",
    "    main { display: grid; gap: 16px; justify-items: center; }",
    "    #count-value { font-size: 48px; font-weight: 700; }",
    "    button { font: inherit; padding: 10px 16px; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <output id=\"count-value\" aria-live=\"polite\">0</output>",
    "    <button id=\"count-up\" type=\"button\">Count up</button>",
    "  </main>",
    "  <script>",
    "    const button = document.getElementById(\"count-up\");",
    "    const value = document.getElementById(\"count-value\");",
    "    let count = 0;",
    "    button.addEventListener(\"click\", () => {",
    "      count += 1;",
    "      value.textContent = String(count);",
    "    });",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
}

async function runInteractivePreviewCodexProbe(params: {
  sandbox: DaytonaSandbox;
  token: string;
  chatgptAuth: SmokeChatgptAuth;
}): Promise<Record<string, unknown>> {
  const html = buildInteractivePreviewProbeHtml();
  const body = JSON.stringify({
    run_id: `daytona_interactive_preview_probe_${Date.now()}`,
    model: DEFAULT_CODEX_MODEL_ID,
    sandbox_name: "polynet-daytona-interactive-preview-probe",
    destroy_after_run: false,
    developer_instructions: [
      "POLYNET_DAYTONA_INTERACTIVE_PREVIEW_PROBE: this is a staging-only Codex preview proof.",
      "Use Codex native file editing and shell execution for workspace work.",
      "Call workspace_serve exactly once after the app file exists.",
      "Do not call workspace_bash, computer_open_url, computer_screenshot, or any PolyNet platform tool.",
      `After the preview app is served, include the exact text ${INTERACTIVE_PREVIEW_PROBE_SENTINEL} in the final answer.`,
      "Do not mention Daytona, hosting vendors, or internal smoke-test infrastructure.",
    ].join(" "),
    prompt: [
      "Create a deterministic browser-interaction probe in the workspace.",
      `Create or overwrite ${INTERACTIVE_PREVIEW_PROBE_FILE} with exactly this HTML:`,
      html,
      `Serve the workspace root with workspace_serve using command "python3 -m http.server ${INTERACTIVE_PREVIEW_PROBE_PORT} --bind 0.0.0.0" and port ${INTERACTIVE_PREVIEW_PROBE_PORT}.`,
      "Do not use a package manager or install dependencies.",
      "Do not call computer_open_url or computer_screenshot.",
      "Do not call workspace_bash.",
      "Final answer must be short and include:",
      INTERACTIVE_PREVIEW_PROBE_SENTINEL,
      `port=${INTERACTIVE_PREVIEW_PROBE_PORT}`,
    ].join("\n"),
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
    { timeoutSeconds: 300 },
  );
  const turnResult = JSON.parse(result.output) as Record<string, unknown>;
  const readback = await runRemote(
    params.sandbox,
    `cat ${shellQuote(INTERACTIVE_PREVIEW_PROBE_FILE)}`,
    { timeoutSeconds: 30, allowFailure: true },
  );
  const fileText = readback.output;
  return {
    ...turnResult,
    interactive_file_readback: fileText,
    interactive_file_readback_exit_code: readback.exitCode,
    interactive_file_readback_ok:
      readback.exitCode === 0 &&
      fileText.includes('id="count-up"') &&
      fileText.includes('id="count-value"') &&
      fileText.includes("addEventListener"),
  };
}

function findLastEventPayload(
  events: Record<string, unknown>[],
  targetEventType: string,
): Record<string, unknown> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (eventType(event) !== targetEventType) continue;
    return eventPayload(event);
  }
  return null;
}

function extractInteractivePreviewPort(turn: Record<string, unknown>): number | null {
  const events = turnEvents(turn);
  const previewReady = findLastEventPayload(events, "workspace_preview_ready");
  const serveRequested = findLastEventPayload(events, "workspace_serve_requested");
  const port =
    readNumber(previewReady?.port) ??
    readNumber(serveRequested?.port);
  return port;
}

async function runSignedPreviewBrowserInteractionProbe(params: {
  sandbox: DaytonaSandbox;
  port: number;
}): Promise<Record<string, unknown>> {
  if (typeof params.sandbox.getSignedPreviewUrl !== "function") {
    fail("interactive preview probe requires sandbox.getSignedPreviewUrl.");
  }
  const signedPreview = await params.sandbox.getSignedPreviewUrl(
    params.port,
    readPreviewExpirySeconds(),
  );
  const previewUrl = readString(
    typeof signedPreview === "string" ? signedPreview : signedPreview?.url,
  );
  if (!previewUrl) fail("interactive preview probe could not resolve a signed preview URL.");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  let responseStatus: number | null = null;
  let beforeText = "";
  let afterText = "";
  let attempts = 0;
  try {
    const page = await browser.newPage();
    page.on("console", (message) => {
      const text = previewTextForProbe(`${message.type()}: ${message.text()}`, 300);
      if (text) consoleMessages.push(text);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(previewTextForProbe(error.message, 300));
    });

    let loaded = false;
    for (attempts = 1; attempts <= 5; attempts += 1) {
      const response = await page.goto(previewUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      responseStatus = response?.status() ?? null;
      try {
        await page.waitForSelector("#count-up", { timeout: 10_000 });
        await page.waitForSelector("#count-value", { timeout: 10_000 });
        loaded = true;
        break;
      } catch {
        if (attempts >= 5) throw new Error("interactive preview selectors were not visible.");
        await page.waitForTimeout(2_000);
      }
    }

    if (!loaded) throw new Error("interactive preview did not load.");
    const counter = page.locator("#count-value");
    beforeText = (await counter.innerText({ timeout: 10_000 })).trim();
    await page.locator("#count-up").click({ timeout: 10_000 });
    await page.waitForFunction(
      () => document.querySelector("#count-value")?.textContent?.trim() === "1",
      undefined,
      { timeout: 10_000 },
    );
    afterText = (await counter.innerText({ timeout: 10_000 })).trim();
  } finally {
    await browser.close();
  }

  const previewUrlHost = new URL(previewUrl).host;
  return {
    ok: beforeText === "0" && afterText === "1" && pageErrors.length === 0,
    port: params.port,
    preview_url_host: previewUrlHost,
    response_status: responseStatus,
    attempts,
    before_text: beforeText,
    after_text: afterText,
    console_messages: consoleMessages.slice(-10),
    page_errors: pageErrors.slice(-10),
  };
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
    ephemeral: params.reusableForUi
      ? defaultDaytonaProviderEphemeralForLifecycleMode("thread_ephemeral")
      : defaultDaytonaProviderEphemeralForLifecycleMode("per_turn_ephemeral"),
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
  codexFullAccess: boolean;
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
  if (codex?.model !== DEFAULT_CODEX_MODEL_ID) fail(`health codex.model was ${String(codex?.model)}.`);
  if (nativeCodex?.thread_approval_policy !== "never") {
    fail("health native Codex thread approval policy was not never.");
  }
  const expectedThreadSandbox = params.codexFullAccess
    ? "danger-full-access"
    : "workspace-write";
  if (nativeCodex?.thread_sandbox !== expectedThreadSandbox) {
    fail(`health native Codex thread sandbox was not ${expectedThreadSandbox}.`);
  }
  if (nativeCodex?.turn_approval_policy !== "never") {
    fail("health native Codex turn approval policy was not never.");
  }
  if (params.codexFullAccess) {
    if (turnSandboxPolicy?.type !== "dangerFullAccess") {
      fail("health native Codex turn sandbox policy was not dangerFullAccess.");
    }
  } else if (turnSandboxPolicy?.type !== "workspaceWrite" || turnSandboxPolicy?.network_access !== false) {
    fail("health native Codex turn sandbox policy was not workspaceWrite with network disabled.");
  }
  if (
    workspaceToolAccess?.mode !== "native_codex" ||
    workspaceToolAccess?.shell_tool !== null ||
    workspaceToolAccess?.access !== "native"
  ) {
    fail("health workspace tool access did not report native Codex workspace access.");
  }
  if (params.probe.ok !== true) fail(`workspace probe failed: ${JSON.stringify(params.probe)}`);
  if (params.probe.workspace_host_id !== "daytona") {
    fail("workspace probe did not execute through the Daytona workspace host.");
  }
  if (params.probe.workspace_root !== REMOTE_WORKSPACE_ROOT) {
    fail(`workspace probe root was ${String(params.probe.workspace_root)} instead of ${REMOTE_WORKSPACE_ROOT}.`);
  }
}

function assertLiveSmokeResult(params: {
  health: Record<string, unknown>;
  probe: Record<string, unknown>;
  turn: Record<string, unknown>;
  codexFullAccess: boolean;
}): void {
  assertPreparedSmokeResult({
    health: params.health,
    probe: params.probe,
    codexFullAccess: params.codexFullAccess,
  });

  if (params.turn.ok !== true) fail(`real Codex turn failed: ${JSON.stringify(params.turn)}`);
  if (params.turn.workspace_host_id !== "daytona") {
    fail("real Codex turn did not execute through the Daytona workspace host.");
  }
  if (params.turn.workspace_root !== REMOTE_WORKSPACE_ROOT) {
    fail(`real Codex turn workspace root was ${String(params.turn.workspace_root)}.`);
  }
  if (params.turn.model_id !== DEFAULT_CODEX_MODEL_ID) {
    fail(`real Codex turn model was ${String(params.turn.model_id)}.`);
  }
  const events = Array.isArray(params.turn.events) ? params.turn.events : [];
  const advertisedEvent = events.find((event) => {
    const record = asRecord(event);
    return readString(record?.event_type) === "codex_dynamic_tools_advertised";
  });
  const advertisedPayload = asRecord(asRecord(advertisedEvent)?.payload);
  if (!advertisedPayload) {
    fail("real Codex turn did not emit codex_dynamic_tools_advertised.");
  }
  const advertisedToolNames = readStringArray(advertisedPayload.tool_names);
  const runtimeAdapterToolNames = readStringArray(
    advertisedPayload.runtime_adapter_tool_names,
  );
  const forbiddenToolNamesPresent = readStringArray(
    advertisedPayload.forbidden_tool_names_present,
  );
  if (advertisedPayload.workspace_host_id !== "daytona") {
    fail("advertised Codex dynamic tools did not report Daytona workspace host.");
  }
  if (
    advertisedPayload.workspace_access_mode !== "native_codex" ||
    advertisedPayload.duplicate_shell_tool !== false ||
    advertisedPayload.shell_tool !== null
  ) {
    fail("advertised Codex dynamic tools did not report native Codex workspace access.");
  }
  if (forbiddenToolNamesPresent.length > 0) {
    fail(`advertised Codex dynamic tools included forbidden tools: ${forbiddenToolNamesPresent.join(",")}`);
  }
  if (advertisedToolNames.includes("workspace_bash")) {
    fail("advertised Codex dynamic tools included workspace_bash in Daytona mode.");
  }
  if (!runtimeAdapterToolNames.includes("workspace_serve")) {
    fail("advertised Codex dynamic tools did not include workspace_serve.");
  }
  const toolCalls = Array.isArray(params.turn.tool_calls) ? params.turn.tool_calls : [];
  if (toolCalls.length !== 0) {
    fail(`real Codex turn should not call workspace_bash in Daytona mode, saw ${toolCalls.length}.`);
  }
  if (params.turn.native_file_readback_ok !== true) {
    const eventTypes = events
      .map((event) => readString(asRecord(event)?.event_type))
      .filter(Boolean);
    const itemTypes = events
      .filter((event) => readString(asRecord(event)?.event_type) === "codex_item_completed")
      .map((event) => readString(asRecord(asRecord(event)?.payload)?.item_type))
      .filter(Boolean);
    const approvalDenials = events.filter(
      (event) => readString(asRecord(event)?.event_type) === "codex_approval_request_denied",
    );
    fail(
      [
        "real Codex turn did not create the expected marker file through native Codex workspace tools.",
        `native_file_readback_exit_code=${String(params.turn.native_file_readback_exit_code)}`,
        `native_file_readback=${readString(params.turn.native_file_readback).slice(0, 500)}`,
        `assistant_text=${readString(params.turn.assistant_text).slice(0, 1000)}`,
        `event_types=${eventTypes.join(",").slice(0, 1000)}`,
        `completed_item_types=${itemTypes.join(",").slice(0, 1000)}`,
        `approval_denial_count=${approvalDenials.length}`,
      ].join("\n"),
    );
  }
  const assistantText = readString(params.turn.assistant_text);
  if (!assistantText.includes(TURN_PROOF_ASSISTANT_SENTINEL)) {
    fail("real Codex turn assistant text did not include the PolyNet sentinel behavior.");
  }
  if (!assistantText.includes(TURN_PROOF_MARKER)) {
    fail("real Codex turn assistant text did not report the marker contents.");
  }
  if (params.codexFullAccess) {
    const envSeen = params.turn.full_access_canary_env_seen;
    const fileSeen = params.turn.full_access_canary_file_seen;
    if (envSeen !== "no") {
      fail(
        `real Codex full-access turn could see the worker env canary: canary_env_seen=${String(envSeen)}.`,
      );
    }
    if (fileSeen !== "yes" && fileSeen !== "no") {
      fail("real Codex full-access turn did not report canary_file_seen=yes/no.");
    }
  }
}

function turnEvents(turn: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(turn.events)) return [];
  return turn.events
    .map((event) => asRecord(event))
    .filter((event): event is Record<string, unknown> => Boolean(event));
}

function eventType(event: Record<string, unknown>): string {
  return readString(event.event_type);
}

function eventPayload(event: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(event.payload);
}

function countNativeProbeRuntimeAdapterCalls(events: Record<string, unknown>[]): number {
  const adapterEventTypes = new Set([
    "workspace_serve_requested",
    "workspace_serve_finished",
    "workspace_preview_ready",
    "computer_tool_requested",
    "computer_tool_completed",
    "platform_tool_requested",
    "platform_tool_finished",
    "workspace_exec_requested",
    "workspace_exec_finished",
  ]);
  const adapterTools = new Set([
    "workspace_serve",
    "workspace_bash",
    "computer_open_url",
    "computer_screenshot",
  ]);
  return events.filter((event) => {
    if (adapterEventTypes.has(eventType(event))) return true;
    const payload = eventPayload(event);
    return adapterTools.has(readString(payload?.tool)) || adapterTools.has(readString(payload?.tool_name));
  }).length;
}

function nativeProbeFailureSignals(turn: Record<string, unknown>): string[] {
  const text = [
    readString(turn.assistant_text),
    readString(turn.error),
    JSON.stringify(turnEvents(turn).map((event) => eventPayload(event) ?? {})),
  ].join("\n");
  const patterns: Array<[RegExp, string]> = [
    [/shell wrapper/i, "shell_wrapper_error"],
    [/sandbox networking setup/i, "sandbox_networking_setup_error"],
    [/patch layer/i, "patch_layer_error"],
    [/write[^\n]{0,120}rejected/i, "write_rejected"],
    [/workspace shell access is blocked/i, "workspace_shell_blocked"],
    [/file writes are failing/i, "file_writes_failing"],
    [/approval request denied|approval denied/i, "approval_denied"],
  ];
  return patterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);
}

function sandboxDirectWriteOk(nativeSandboxPrereq: Record<string, unknown> | null): boolean | null {
  const writeProbe = asRecord(nativeSandboxPrereq?.workspace_write_probe);
  if (!writeProbe) return null;
  return writeProbe.exit_code === 0 && readString(writeProbe.stdout).includes("native-sandbox-probe");
}

function classifyNativeWorkspaceProbeFailure(params: {
  turn: Record<string, unknown>;
  nativeSandboxPrereq: Record<string, unknown> | null;
}): string {
  const directWriteOk = sandboxDirectWriteOk(params.nativeSandboxPrereq);
  if (directWriteOk === true) return "daytona_direct_write_ok_codex_native_workspace_failed";
  if (directWriteOk === false) return "daytona_direct_write_failed";
  if (params.turn.ok !== true) return "codex_turn_failed_before_workspace_classification";
  return "native_workspace_probe_failed";
}

function assertNativeWorkspaceProbeResult(params: {
  health: Record<string, unknown>;
  probe: Record<string, unknown>;
  turn: Record<string, unknown>;
  nativeSandboxPrereq: Record<string, unknown> | null;
}): void {
  assertPreparedSmokeResult({
    health: params.health,
    probe: params.probe,
    codexFullAccess: true,
  });

  const events = turnEvents(params.turn);
  const assistantText = readString(params.turn.assistant_text);
  const runtimeAdapterCallCount = countNativeProbeRuntimeAdapterCalls(events);
  const failureSignals = nativeProbeFailureSignals(params.turn);
  const failNativeProbe = (message: string): never => {
    fail(
      [
        message,
        `classification=${classifyNativeWorkspaceProbeFailure({
          turn: params.turn,
          nativeSandboxPrereq: params.nativeSandboxPrereq,
        })}`,
        `native_file_readback_exit_code=${String(params.turn.native_file_readback_exit_code)}`,
        `native_file_readback=${readString(params.turn.native_file_readback).slice(0, 500)}`,
        `assistant_text=${assistantText.slice(0, 1000)}`,
        `runtime_adapter_call_count=${runtimeAdapterCallCount}`,
        `failure_signals=${failureSignals.join(",") || "none"}`,
        `event_types=${events.map(eventType).filter(Boolean).join(",").slice(0, 1000)}`,
      ].join("\n"),
    );
  };

  if (params.turn.ok !== true) {
    failNativeProbe(`native Codex workspace probe failed: ${JSON.stringify(params.turn.error ?? null)}`);
  }
  if (params.turn.workspace_host_id !== "daytona") {
    failNativeProbe("native Codex workspace probe did not execute through Daytona.");
  }
  if (params.turn.workspace_root !== REMOTE_WORKSPACE_ROOT) {
    failNativeProbe(`native Codex workspace probe root was ${String(params.turn.workspace_root)}.`);
  }
  if (params.turn.model_id !== DEFAULT_CODEX_MODEL_ID) {
    failNativeProbe(`native Codex workspace probe model was ${String(params.turn.model_id)}.`);
  }
  if (Array.isArray(params.turn.tool_calls) && params.turn.tool_calls.length !== 0) {
    failNativeProbe(`native Codex workspace probe used duplicate workspace tool calls: ${params.turn.tool_calls.length}.`);
  }
  if (runtimeAdapterCallCount !== 0) {
    failNativeProbe("native Codex workspace probe used runtime adapter or fallback tools.");
  }
  if (failureSignals.length > 0) {
    failNativeProbe("native Codex workspace probe surfaced known native workspace failure text.");
  }
  if (params.turn.native_file_readback_ok !== true) {
    failNativeProbe("native Codex workspace probe did not create the expected file contents.");
  }
  if (!assistantText.includes(NATIVE_WORKSPACE_PROBE_SENTINEL)) {
    failNativeProbe("native Codex workspace probe assistant text did not include the sentinel.");
  }
  if (!assistantText.includes(`file_contents=${NATIVE_WORKSPACE_PROBE_MARKER}`)) {
    failNativeProbe("native Codex workspace probe assistant text did not report the file contents.");
  }
  if (!assistantText.includes(REMOTE_WORKSPACE_ROOT)) {
    failNativeProbe("native Codex workspace probe assistant text did not report the workspace pwd.");
  }
}

function countInteractivePreviewForbiddenCalls(events: Record<string, unknown>[]): number {
  const forbiddenEventTypes = new Set([
    "computer_tool_requested",
    "computer_tool_completed",
    "platform_tool_requested",
    "platform_tool_finished",
    "workspace_exec_requested",
    "workspace_exec_finished",
  ]);
  const forbiddenTools = new Set([
    "workspace_bash",
    "computer_open_url",
    "computer_screenshot",
  ]);
  return events.filter((event) => {
    if (forbiddenEventTypes.has(eventType(event))) return true;
    const payload = eventPayload(event);
    return forbiddenTools.has(readString(payload?.tool)) || forbiddenTools.has(readString(payload?.tool_name));
  }).length;
}

function assertInteractivePreviewCodexProbeResult(params: {
  health: Record<string, unknown>;
  probe: Record<string, unknown>;
  turn: Record<string, unknown>;
}): void {
  assertPreparedSmokeResult({
    health: params.health,
    probe: params.probe,
    codexFullAccess: true,
  });

  const events = turnEvents(params.turn);
  const assistantText = readString(params.turn.assistant_text);
  const failureSignals = nativeProbeFailureSignals(params.turn);
  const forbiddenCallCount = countInteractivePreviewForbiddenCalls(events);
  const serveRequested = findLastEventPayload(events, "workspace_serve_requested");
  const serveFinished = findLastEventPayload(events, "workspace_serve_finished");
  const previewReady = findLastEventPayload(events, "workspace_preview_ready");
  const failInteractiveProbe = (message: string): never => {
    fail(
      [
        message,
        `interactive_file_readback_exit_code=${String(params.turn.interactive_file_readback_exit_code)}`,
        `interactive_file_readback=${readString(params.turn.interactive_file_readback).slice(0, 500)}`,
        `assistant_text=${assistantText.slice(0, 1000)}`,
        `forbidden_call_count=${forbiddenCallCount}`,
        `failure_signals=${failureSignals.join(",") || "none"}`,
        `workspace_serve_requested=${JSON.stringify(serveRequested ?? null).slice(0, 500)}`,
        `workspace_serve_finished=${JSON.stringify(serveFinished ?? null).slice(0, 500)}`,
        `workspace_preview_ready=${JSON.stringify(previewReady ?? null).slice(0, 500)}`,
        `event_types=${events.map(eventType).filter(Boolean).join(",").slice(0, 1000)}`,
      ].join("\n"),
    );
  };

  if (params.turn.ok !== true) {
    failInteractiveProbe(`interactive preview Codex probe failed: ${JSON.stringify(params.turn.error ?? null)}`);
  }
  if (params.turn.workspace_host_id !== "daytona") {
    failInteractiveProbe("interactive preview Codex probe did not execute through Daytona.");
  }
  if (params.turn.workspace_root !== REMOTE_WORKSPACE_ROOT) {
    failInteractiveProbe(`interactive preview Codex probe root was ${String(params.turn.workspace_root)}.`);
  }
  if (params.turn.model_id !== DEFAULT_CODEX_MODEL_ID) {
    failInteractiveProbe(`interactive preview Codex probe model was ${String(params.turn.model_id)}.`);
  }

  const advertisedEvent = events.find((event) => eventType(event) === "codex_dynamic_tools_advertised");
  const advertisedPayload = eventPayload(advertisedEvent ?? {});
  const advertisedToolNames = readStringArray(advertisedPayload?.tool_names);
  const runtimeAdapterToolNames = readStringArray(advertisedPayload?.runtime_adapter_tool_names);
  const forbiddenToolNamesPresent = readStringArray(advertisedPayload?.forbidden_tool_names_present);
  if (!advertisedPayload) {
    failInteractiveProbe("interactive preview Codex probe did not emit codex_dynamic_tools_advertised.");
  }
  if (
    advertisedPayload.workspace_access_mode !== "native_codex" ||
    advertisedPayload.duplicate_shell_tool !== false ||
    advertisedPayload.shell_tool !== null
  ) {
    failInteractiveProbe("interactive preview Codex probe did not advertise native Codex workspace access.");
  }
  if (forbiddenToolNamesPresent.length > 0 || advertisedToolNames.includes("workspace_bash")) {
    failInteractiveProbe(
      `interactive preview Codex probe advertised forbidden tools: ${forbiddenToolNamesPresent.join(",")}`,
    );
  }
  if (!runtimeAdapterToolNames.includes("workspace_serve")) {
    failInteractiveProbe("interactive preview Codex probe did not advertise workspace_serve.");
  }
  if (Array.isArray(params.turn.tool_calls) && params.turn.tool_calls.length !== 0) {
    failInteractiveProbe(`interactive preview Codex probe used duplicate workspace tool calls: ${params.turn.tool_calls.length}.`);
  }
  if (forbiddenCallCount !== 0) {
    failInteractiveProbe("interactive preview Codex probe used forbidden fallback, computer, or platform calls.");
  }
  if (failureSignals.length > 0) {
    failInteractiveProbe("interactive preview Codex probe surfaced known native workspace failure text.");
  }
  if (params.turn.interactive_file_readback_ok !== true) {
    failInteractiveProbe("interactive preview Codex probe did not create the expected interactive app file.");
  }
  if (readNumber(serveRequested?.port) !== INTERACTIVE_PREVIEW_PROBE_PORT) {
    failInteractiveProbe("interactive preview Codex probe did not request workspace_serve on the expected port.");
  }
  if (serveFinished?.ok !== true || readNumber(serveFinished?.port) !== INTERACTIVE_PREVIEW_PROBE_PORT) {
    failInteractiveProbe("interactive preview Codex probe did not finish workspace_serve successfully.");
  }
  if (readNumber(previewReady?.port) !== INTERACTIVE_PREVIEW_PROBE_PORT) {
    failInteractiveProbe("interactive preview Codex probe did not emit workspace_preview_ready for the expected port.");
  }
  if (!assistantText.includes(INTERACTIVE_PREVIEW_PROBE_SENTINEL)) {
    failInteractiveProbe("interactive preview Codex probe assistant text did not include the sentinel.");
  }
  if (!assistantText.includes(`port=${INTERACTIVE_PREVIEW_PROBE_PORT}`)) {
    failInteractiveProbe("interactive preview Codex probe assistant text did not report the preview port.");
  }
}

function assertSignedPreviewBrowserInteractionProbeResult(result: Record<string, unknown>): void {
  if (result.ok === true) return;
  fail(
    [
      "interactive signed preview browser probe failed.",
      `port=${String(result.port ?? "")}`,
      `preview_url_host=${String(result.preview_url_host ?? "")}`,
      `response_status=${String(result.response_status ?? "")}`,
      `attempts=${String(result.attempts ?? "")}`,
      `before_text=${String(result.before_text ?? "").slice(0, 200)}`,
      `after_text=${String(result.after_text ?? "").slice(0, 200)}`,
      `console_messages=${JSON.stringify(result.console_messages ?? []).slice(0, 800)}`,
      `page_errors=${JSON.stringify(result.page_errors ?? []).slice(0, 800)}`,
    ].join("\n"),
  );
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
    fail("--prepare-only requires --keep-sandbox because it creates a reusable debug sandbox.");
  }
  if (args.nativeWorkspaceProbe && args.interactivePreviewProbe) {
    fail("--native-workspace-probe and --interactive-preview-probe are separate probe modes; run one at a time.");
  }
  if (args.nativeWorkspaceProbe && !args.codexFullAccess) {
    fail("--native-workspace-probe requires Codex danger-full-access; do not combine it with --codex-workspace-write.");
  }
  if (args.interactivePreviewProbe && !args.codexFullAccess) {
    fail("--interactive-preview-probe requires Codex danger-full-access; do not combine it with --codex-workspace-write.");
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
  let nativeSandboxPrereqBefore: Record<string, unknown> | null = null;
  let nativeSandboxPrereqAfter: Record<string, unknown> | null = null;
  let bubblewrapInstall: Record<string, unknown> | null = null;
  let signedPreviewBrowserInteraction: Record<string, unknown> | null = null;
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
    nativeSandboxPrereqBefore = await runNativeSandboxPrereqProbe(sandbox);
    if (args.installBubblewrap) {
      bubblewrapInstall = await installBubblewrapInSandbox(sandbox);
      nativeSandboxPrereqAfter = await runNativeSandboxPrereqProbe(sandbox);
    } else {
      nativeSandboxPrereqAfter = nativeSandboxPrereqBefore;
    }

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
            native_sandbox_prereq_before: nativeSandboxPrereqBefore,
            bubblewrap_install: bubblewrapInstall,
            native_sandbox_prereq_after: nativeSandboxPrereqAfter,
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
        `find ${shellQuote(REMOTE_ROOT)} -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +`,
        `tar -xzf ${shellQuote(REMOTE_TARBALL)} -C ${shellQuote(REMOTE_ROOT)}`,
      ].join("\n"),
      { timeoutSeconds: 180 },
    );
    if (args.codexFullAccess) {
      await writeFullAccessCanaryFile(sandbox);
    }
    await startWorkerInDaytona({ sandbox, token, codexFullAccess: args.codexFullAccess });
    const health = await waitForWorkerHealth({ sandbox, token, timeoutMs: 120_000 });
    const probe = await runWorkspaceProbe({ sandbox, token });
    const turn = args.prepareOnly
      ? null
      : args.nativeWorkspaceProbe
        ? await runNativeCodexWorkspaceProbe({
            sandbox,
            token,
            chatgptAuth: chatgptAuth as SmokeChatgptAuth,
          })
        : args.interactivePreviewProbe
          ? await runInteractivePreviewCodexProbe({
              sandbox,
              token,
              chatgptAuth: chatgptAuth as SmokeChatgptAuth,
            })
        : await runRealCodexTurnProof({
            sandbox,
            token,
            chatgptAuth: chatgptAuth as SmokeChatgptAuth,
            codexFullAccess: args.codexFullAccess,
          });
    if (turn) {
      if (args.nativeWorkspaceProbe) {
        assertNativeWorkspaceProbeResult({
          health,
          probe,
          turn,
          nativeSandboxPrereq: nativeSandboxPrereqAfter,
        });
      } else if (args.interactivePreviewProbe) {
        assertInteractivePreviewCodexProbeResult({
          health,
          probe,
          turn,
        });
        const port = extractInteractivePreviewPort(turn);
        if (port !== INTERACTIVE_PREVIEW_PROBE_PORT) {
          fail(`interactive preview probe returned port ${String(port)} instead of ${INTERACTIVE_PREVIEW_PROBE_PORT}.`);
        }
        signedPreviewBrowserInteraction = await runSignedPreviewBrowserInteractionProbe({
          sandbox,
          port,
        });
        assertSignedPreviewBrowserInteractionProbeResult(signedPreviewBrowserInteraction);
      } else {
        assertLiveSmokeResult({
          health,
          probe,
          turn,
          codexFullAccess: args.codexFullAccess,
        });
      }
    } else {
      assertPreparedSmokeResult({ health, probe, codexFullAccess: args.codexFullAccess });
    }

    let previewUrl: string | null = null;
    if (!args.nativeWorkspaceProbe && typeof sandbox.getSignedPreviewUrl === "function") {
      const preview = await sandbox.getSignedPreviewUrl(WORKER_PORT, readPreviewExpirySeconds());
      previewUrl = readString(preview.url) || null;
    }
    const codex = health.codex as Record<string, unknown> | undefined;

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: args.prepareOnly
            ? "prepare_only"
            : args.nativeWorkspaceProbe
              ? "native_workspace_probe"
              : args.interactivePreviewProbe
                ? "interactive_preview_probe"
              : "live_turn",
          sandbox_id: sandbox.id,
          created_sandbox: createdSandbox,
          kept_sandbox: args.keepSandbox,
          workspace_host_id: probe.workspace_host_id,
          workspace_root: probe.workspace_root,
          codex_initialized: codex?.initialized === true,
          codex_model: codex?.model ?? null,
          codex_full_access_probe: args.codexFullAccess,
          execution_policy: health.execution_policy ?? null,
          native_sandbox_prereq_before: nativeSandboxPrereqBefore,
          bubblewrap_install: bubblewrapInstall,
          native_sandbox_prereq_after: nativeSandboxPrereqAfter,
          ...(turn
            ? {
                [args.nativeWorkspaceProbe
                  ? "native_workspace_probe"
                  : args.interactivePreviewProbe
                    ? "interactive_preview_probe"
                    : "real_turn"]: {
                  ok: turn.ok === true,
                  workspace_host_id: turn.workspace_host_id ?? null,
                  workspace_root: turn.workspace_root ?? null,
                  model_id: turn.model_id ?? null,
                  tool_call_count: Array.isArray(turn.tool_calls) ? turn.tool_calls.length : 0,
                  runtime_adapter_call_count: countNativeProbeRuntimeAdapterCalls(turnEvents(turn)),
                  assistant_sentinel_seen: readString(turn.assistant_text).includes(
                    args.nativeWorkspaceProbe
                      ? NATIVE_WORKSPACE_PROBE_SENTINEL
                      : args.interactivePreviewProbe
                        ? INTERACTIVE_PREVIEW_PROBE_SENTINEL
                      : TURN_PROOF_ASSISTANT_SENTINEL,
                  ),
                  marker_seen: readString(turn.assistant_text).includes(
                    args.nativeWorkspaceProbe
                      ? NATIVE_WORKSPACE_PROBE_MARKER
                      : args.interactivePreviewProbe
                        ? `port=${INTERACTIVE_PREVIEW_PROBE_PORT}`
                      : TURN_PROOF_MARKER,
                  ),
                  workspace_file_readback_ok: args.interactivePreviewProbe
                    ? turn.interactive_file_readback_ok === true
                    : turn.native_file_readback_ok === true,
                  native_failure_signals: nativeProbeFailureSignals(turn),
                  full_access_canary_env_seen:
                    turn.full_access_canary_env_seen ?? null,
                  full_access_canary_file_seen:
                    turn.full_access_canary_file_seen ?? null,
                  ...(args.interactivePreviewProbe
                    ? {
                        interactive_file_readback_ok: turn.interactive_file_readback_ok === true,
                        preview_port: extractInteractivePreviewPort(turn),
                        signed_preview_browser_interaction: signedPreviewBrowserInteraction,
                      }
                    : {}),
                },
              }
            : {
                prepared_staging_reuse_warning:
                  "Do not set POLYNET_DAYTONA_DIRECT_SANDBOX_ID for normal UI testing; it intentionally reuses one sandbox across threads.",
                prepared_staging_reuse_sandbox_id: sandbox.id,
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
