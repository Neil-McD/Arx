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
const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";
const WORKER_PORT = DAYTONA_CODEX_WORKER_PORT;
const REMOTE_ROOT = DAYTONA_CODEX_REMOTE_ROOT;
const REMOTE_WORKSPACE_ROOT = DAYTONA_CODEX_WORKSPACE_ROOT;
const DEFAULT_CODEX_MODEL_ID = DAYTONA_RUNTIME_POLICY.nativeCodex.defaultModelId;
const REMOTE_TARBALL = "/home/daytona/polynet-codex-runtime-promote.tgz";
const REMOTE_WORKER_LOG = "/tmp/polynet-codex-worker.log";
const REMOTE_WORKER_PID = "/tmp/polynet-codex-worker.pid";
const REMOTE_SNAPSHOT_RECEIPT = `${REMOTE_ROOT}/.polynet-daytona-runtime-snapshot-receipt.json`;
const DEFAULT_CODEX_PACKAGE = "@openai/codex@0.141.0";
const NATIVE_WORKSPACE_PROBE_FILE = `${REMOTE_WORKSPACE_ROOT}/codex-native-probe.txt`;
const NATIVE_WORKSPACE_PROBE_MARKER = "OK";
const NATIVE_WORKSPACE_PROBE_SENTINEL = "codex-native-workspace-probe-ok";

type DaytonaClient = {
  create(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<DaytonaSandbox>;
  get(sandboxIdOrName: string): Promise<DaytonaSandbox>;
  delete?(sandbox: DaytonaSandbox, timeout?: number): Promise<void>;
};

type DaytonaSandbox = {
  id: string;
  name?: string;
  state?: string;
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
  _experimental_createSnapshot?(name: string, timeout?: number): Promise<void>;
  delete?(timeout?: number): Promise<void>;
};

type PromoteArgs = {
  snapshotName: string;
  updateConvexEnv: boolean;
  keepSandboxes: boolean;
  skipNativeProbe: boolean;
};

type SmokeChatgptAuth = {
  accessToken: string;
  accountId: string;
  planType: string | null;
};

function fail(message: string): never {
  throw new Error(message);
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandOutput(result: { result?: string; artifacts?: { stdout?: string } }): string {
  return String(result.result ?? "") || String(result.artifacts?.stdout ?? "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function defaultSnapshotName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
  return `polynet-codex-runtime-stage-${stamp}`;
}

function parseArgs(argv: string[]): PromoteArgs {
  let snapshotName = readEnv("POLYNET_DAYTONA_PROMOTE_SNAPSHOT_NAME") || defaultSnapshotName();
  let updateConvexEnv = readEnv("POLYNET_DAYTONA_PROMOTE_UPDATE_CONVEX_ENV") !== "0";
  let keepSandboxes = readEnv("POLYNET_DAYTONA_PROMOTE_KEEP_SANDBOXES") === "1";
  let skipNativeProbe = readEnv("POLYNET_DAYTONA_PROMOTE_SKIP_NATIVE_PROBE") === "1";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--snapshot-name") {
      snapshotName = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--snapshot-name=")) {
      snapshotName = arg.slice("--snapshot-name=".length).trim();
      continue;
    }
    if (arg === "--no-update-convex-env") {
      updateConvexEnv = false;
      continue;
    }
    if (arg === "--keep-sandboxes") {
      keepSandboxes = true;
      continue;
    }
    if (arg === "--skip-native-probe") {
      skipNativeProbe = true;
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  if (!/^polynet-codex-runtime-stage-[a-zA-Z0-9._-]+$/.test(snapshotName)) {
    fail(`snapshot name must start with polynet-codex-runtime-stage-, got ${snapshotName}`);
  }
  return {
    snapshotName,
    updateConvexEnv,
    keepSandboxes,
    skipNativeProbe,
  };
}

async function runLocal(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
    maxBuffer?: number;
  },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options?.cwd ?? ROOT_DIR,
      env: options?.env ?? process.env,
      maxBuffer: options?.maxBuffer ?? 20 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (options?.allowFailure) {
      return {
        exitCode: typeof err.code === "number" ? err.code : 1,
        stdout: String(err.stdout ?? ""),
        stderr: String(err.stderr ?? err.message ?? ""),
      };
    }
    throw error;
  }
}

async function runStagingGuard(): Promise<void> {
  await runLocal("bash", ["scripts/daytona_codex_runtime_staging_guard.sh"], {
    env: {
      ...process.env,
      CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
      POLYNET_DEPLOYMENT_KIND: "staging",
    },
  });
}

async function readConvexEnv(name: string): Promise<string> {
  const result = await runLocal(
    "npx",
    ["convex", "env", "get", name],
    {
      env: {
        ...process.env,
        CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
      },
      allowFailure: true,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.exitCode !== 0) return "";
  return result.stdout.trim();
}

async function readFirstConfig(names: string[]): Promise<string> {
  for (const name of names) {
    const envValue = readEnv(name);
    if (envValue) return envValue;
    const convexValue = await readConvexEnv(name);
    if (convexValue) return convexValue;
  }
  return "";
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

async function buildDaytonaConfig(): Promise<{
  config: Record<string, unknown>;
  currentSnapshot: string;
}> {
  const apiKey = await readFirstConfig(["DAYTONA_API_KEY"]);
  const apiUrl = await readFirstConfig(["DAYTONA_API_URL"]);
  const target = await readFirstConfig(["DAYTONA_TARGET"]);
  const jwtToken = await readFirstConfig(["DAYTONA_JWT_TOKEN"]);
  const organizationId = await readFirstConfig(["DAYTONA_ORGANIZATION_ID", "DAYTONA_ORG_ID"]);
  const currentSnapshot = await readFirstConfig(["DAYTONA_SNAPSHOT"]);
  if (!apiKey && !jwtToken) {
    fail("DAYTONA_API_KEY or DAYTONA_JWT_TOKEN is required for snapshot promotion.");
  }
  if (jwtToken && !organizationId) {
    fail("DAYTONA_ORGANIZATION_ID is required when DAYTONA_JWT_TOKEN is used.");
  }
  if (!currentSnapshot) {
    fail("DAYTONA_SNAPSHOT is required; refusing to promote from an unbootstrapped base.");
  }
  const config: Record<string, unknown> = {};
  if (apiKey) config.apiKey = apiKey;
  if (apiUrl) config.apiUrl = apiUrl;
  if (target) config.target = target;
  if (jwtToken) config.jwtToken = jwtToken;
  if (organizationId) config.organizationId = organizationId;
  return { config, currentSnapshot };
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
): Promise<{ exitCode: number; output: string }> {
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
    fail(`daytona_remote_command_error\ncommand=${command.slice(0, 500)}\nmessage=${message}`);
  }
  const output = commandOutput(result);
  if (!options?.allowFailure && result.exitCode !== 0) {
    fail(
      [
        "daytona_remote_command_failed",
        `exit_code=${result.exitCode}`,
        `command=${command.slice(0, 500)}`,
        `output=${output.slice(0, 5000)}`,
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
): Promise<{ exitCode: number; output: string }> {
  return await runRemote(sandbox, `bash -lc ${shellQuote(script)}`, options);
}

function logStage(stage: string): void {
  process.stderr.write(`daytona_snapshot_promote_stage: ${stage}\n`);
}

async function createWorktreeTarball(tmpDir: string): Promise<string> {
  const tarballPath = path.join(tmpDir, "polynet-daytona-runtime-snapshot.tgz");
  await runLocal(
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
    { cwd: ROOT_DIR },
  );
  return tarballPath;
}

async function ensureSandboxStarted(sandbox: DaytonaSandbox, timeoutSeconds: number): Promise<void> {
  if (sandbox.state !== "started" && typeof sandbox.start === "function") {
    await sandbox.start(timeoutSeconds);
    return;
  }
  await sandbox.waitUntilStarted?.(timeoutSeconds);
}

async function createSandboxFromSnapshot(params: {
  daytona: DaytonaClient;
  snapshot: string;
  namePrefix: string;
}): Promise<DaytonaSandbox> {
  return await params.daytona.create(
    {
      language: "typescript",
      name: `${params.namePrefix}-${Date.now()}`,
      labels: {
        app: "polynet",
        purpose: "codex-runtime-snapshot-promotion",
        environment: "staging-spike",
      },
      public: DAYTONA_RUNTIME_POLICY.daytonaSandbox.publicPreview,
      autoStopInterval: DAYTONA_RUNTIME_POLICY.daytonaSandbox.autoStopIntervalMinutes,
      ephemeral: defaultDaytonaProviderEphemeralForLifecycleMode("per_turn_ephemeral"),
      snapshot: params.snapshot,
    },
    { timeout: 240 },
  );
}

async function installRuntimeIntoBuilder(sandbox: DaytonaSandbox, tarballPath: string): Promise<void> {
  await sandbox.fs.uploadFile(tarballPath, REMOTE_TARBALL, 180);
  logStage("worktree_upload");
  await runRemoteBash(
    sandbox,
    [
      "set -euo pipefail",
      `mkdir -p ${shellQuote(REMOTE_ROOT)} ${shellQuote(REMOTE_WORKSPACE_ROOT)}`,
      `find ${shellQuote(REMOTE_ROOT)} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`,
      `tar -xzf ${shellQuote(REMOTE_TARBALL)} -C ${shellQuote(REMOTE_ROOT)}`,
    ].join("\n"),
    { timeoutSeconds: 240 },
  );
  logStage("npm_ci_omit_dev");
  await runRemoteBash(
    sandbox,
    [
      "set -euo pipefail",
      "npm ci --omit=dev --ignore-scripts --no-audit --no-fund",
      `npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund ${shellQuote(DEFAULT_CODEX_PACKAGE)}`,
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 900 },
  );
}

async function verifyRuntimeFiles(sandbox: DaytonaSandbox): Promise<Record<string, unknown>> {
  logStage("runtime_file_verify");
  const result = await runRemoteBash(
    sandbox,
    [
      "set -euo pipefail",
      "node <<'NODE'",
      "const { existsSync, readFileSync } = require('node:fs');",
      "const { spawnSync } = require('node:child_process');",
      `const root = ${JSON.stringify(REMOTE_ROOT)};`,
      "function run(command) {",
      "  const result = spawnSync('/bin/sh', ['-lc', command], { cwd: root, encoding: 'utf8', timeout: 15000 });",
      "  return { exit_code: result.status === null ? -1 : result.status, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };",
      "}",
      "const out = {",
      "  package_json: existsSync(`${root}/package.json`),",
      "  package_lock: existsSync(`${root}/package-lock.json`),",
      "  node_modules: existsSync(`${root}/node_modules`),",
      "  codex_cli: existsSync(`${root}/node_modules/.bin/codex`),",
      "  worker_runner: existsSync(`${root}/scripts/run_polynet_codex_worker_service_local.sh`),",
      "  policy: run('node --experimental-strip-types --experimental-specifier-resolution=node --input-type=module -e \"import(\\'./shared/daytonaCodexRuntimePolicy.ts\\').then(({buildDaytonaRuntimePolicyReceipt})=>console.log(JSON.stringify(buildDaytonaRuntimePolicyReceipt())))\"'),",
      "  codex_version: run('node_modules/.bin/codex --version'),",
      "};",
      "console.log(JSON.stringify(out));",
      "NODE",
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 60 },
  );
  const parsed = JSON.parse(result.output) as Record<string, unknown>;
  const policyRun = asRecord(parsed.policy);
  const policy = policyRun?.stdout ? JSON.parse(String(policyRun.stdout)) : null;
  if (parsed.package_json !== true) fail("snapshot runtime missing package.json");
  if (parsed.package_lock !== true) fail("snapshot runtime missing package-lock.json");
  if (parsed.node_modules !== true) fail("snapshot runtime missing node_modules");
  if (parsed.codex_cli !== true) fail("snapshot runtime missing Codex CLI");
  if (parsed.worker_runner !== true) fail("snapshot runtime missing worker runner");
  if (policyRun?.exit_code !== 0) {
    fail(`snapshot runtime policy check failed: ${String(policyRun?.stderr ?? "")}`);
  }
  if (asRecord(asRecord(policy)?.native_codex)?.thread_sandbox !== "danger-full-access") {
    fail("snapshot runtime policy does not default to danger-full-access");
  }
  const codexVersion = asRecord(parsed.codex_version);
  if (codexVersion?.exit_code !== 0) {
    fail(`snapshot Codex CLI version check failed: ${String(codexVersion?.stderr ?? "")}`);
  }
  return {
    ...parsed,
    policy,
  };
}

async function readSmokeChatgptAuth(): Promise<SmokeChatgptAuth | null> {
  const envAccessToken = readEnv("POLYNET_DAYTONA_SMOKE_CHATGPT_ACCESS_TOKEN");
  const envAccountId = readEnv("POLYNET_DAYTONA_SMOKE_CHATGPT_ACCOUNT_ID");
  if (envAccessToken && envAccountId) {
    return {
      accessToken: envAccessToken,
      accountId: envAccountId,
      planType: readEnv("POLYNET_DAYTONA_SMOKE_CHATGPT_PLAN_TYPE") || null,
    };
  }
  const codexHome = readEnv("CODEX_HOME");
  const candidates = [
    codexHome ? path.join(codexHome, "auth.json") : "",
    path.join(os.homedir(), ".codex", "auth.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(candidate, "utf8"));
    } catch {
      continue;
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
    if (!accessToken || !accountId) continue;
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
  return null;
}

function smokeWorkerAuthToken(): string {
  return `polynet-daytona-snapshot-${randomBytes(18).toString("hex")}`;
}

async function startWorkerFromSnapshot(params: {
  sandbox: DaytonaSandbox;
  token: string;
}): Promise<void> {
  const workerEnv: Record<string, string> = {
    POLYNET_CODEX_WORKSPACE_HOST: "daytona",
    POLYNET_DAYTONA_WORKSPACE_ROOT: REMOTE_WORKSPACE_ROOT,
    POLYNET_CODEX_WORKER_HOST: "127.0.0.1",
    POLYNET_CODEX_WORKER_PORT: String(WORKER_PORT),
    POLYNET_CODEX_WORKER_AUTH_TOKEN: params.token,
    POLYNET_CODEX_WORKER_CODEX_BIN: `${REMOTE_ROOT}/node_modules/.bin/codex`,
    POLYNET_CODEX_WORKER_MODEL: DEFAULT_CODEX_MODEL_ID,
    POLYNET_DEPLOYMENT_KIND: "staging",
    CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
    DAYTONA_SANDBOX_ID: params.sandbox.id,
  };
  const envBlock = Object.entries(workerEnv)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
  logStage("worker_start");
  await runRemoteBash(
    params.sandbox,
    [
      "set -euo pipefail",
      `test -f ${shellQuote(`${REMOTE_ROOT}/package.json`)}`,
      `test -d ${shellQuote(`${REMOTE_ROOT}/node_modules`)}`,
      `test -x ${shellQuote(`${REMOTE_ROOT}/node_modules/.bin/codex`)}`,
      `test -f ${shellQuote(`${REMOTE_ROOT}/scripts/run_polynet_codex_worker_service_local.sh`)}`,
      `if test -f ${shellQuote(REMOTE_WORKER_PID)}; then kill "$(cat ${shellQuote(REMOTE_WORKER_PID)})" 2>/dev/null || true; rm -f ${shellQuote(REMOTE_WORKER_PID)}; fi`,
      `nohup env ${envBlock} bash scripts/run_polynet_codex_worker_service_local.sh > ${shellQuote(REMOTE_WORKER_LOG)} 2>&1 & echo $! > ${shellQuote(REMOTE_WORKER_PID)}`,
      "sleep 1",
      `test -s ${shellQuote(REMOTE_WORKER_PID)}`,
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 30 },
  );
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

async function runWorkspaceProbe(params: {
  sandbox: DaytonaSandbox;
  token: string;
}): Promise<Record<string, unknown>> {
  const body = JSON.stringify({
    run_id: `daytona_snapshot_workspace_probe_${Date.now()}`,
    sandbox_name: "polynet-daytona-snapshot-workspace-probe",
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
  const parsed = JSON.parse(result.output) as Record<string, unknown>;
  if (parsed.ok !== true) fail(`workspace probe failed: ${JSON.stringify(parsed)}`);
  if (parsed.workspace_host_id !== "daytona") fail("workspace probe did not use Daytona host");
  if (parsed.workspace_root !== REMOTE_WORKSPACE_ROOT) {
    fail(`workspace probe root mismatch: ${String(parsed.workspace_root)}`);
  }
  return parsed;
}

async function runNativeCodexWorkspaceProbe(params: {
  sandbox: DaytonaSandbox;
  token: string;
  chatgptAuth: SmokeChatgptAuth;
}): Promise<Record<string, unknown>> {
  const body = JSON.stringify({
    run_id: `daytona_snapshot_native_probe_${Date.now()}`,
    model: DEFAULT_CODEX_MODEL_ID,
    sandbox_name: "polynet-daytona-snapshot-native-probe",
    destroy_after_run: false,
    developer_instructions: [
      "POLYNET_DAYTONA_SNAPSHOT_NATIVE_WORKSPACE_PROBE: this is a staging-only Codex native workspace proof.",
      "Use only Codex native workspace capabilities for file and shell work.",
      "Do not call workspace_serve, computer_open_url, computer_screenshot, workspace_bash, or any PolyNet platform tool.",
      `After the native workspace proof succeeds, include the exact text ${NATIVE_WORKSPACE_PROBE_SENTINEL} in the final answer.`,
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
  const events = Array.isArray(turnResult.events) ? turnResult.events : [];
  const eventText = JSON.stringify(events);
  const assistantText = readString(turnResult.assistant_text);
  const runtimeAdapterCallCount = events.filter((event) => {
    const record = asRecord(event);
    const payload = asRecord(record?.payload);
    const eventType = readString(record?.event_type);
    const tool = readString(payload?.tool) || readString(payload?.tool_name);
    return (
      eventType === "workspace_serve_requested" ||
      eventType === "workspace_serve_finished" ||
      eventType === "computer_tool_requested" ||
      eventType === "computer_tool_completed" ||
      eventType === "platform_tool_requested" ||
      tool === "workspace_serve" ||
      tool === "workspace_bash" ||
      tool === "computer_open_url" ||
      tool === "computer_screenshot"
    );
  }).length;
  const failureSignals = [
    /shell wrapper/i.test(`${assistantText}\n${eventText}`) ? "shell_wrapper_error" : "",
    /sandbox networking setup/i.test(`${assistantText}\n${eventText}`) ? "sandbox_networking_setup_error" : "",
    /patch layer/i.test(`${assistantText}\n${eventText}`) ? "patch_layer_error" : "",
    /workspace shell access is blocked/i.test(`${assistantText}\n${eventText}`) ? "workspace_shell_blocked" : "",
  ].filter(Boolean);
  const fileReadbackOk = readback.output.trim() === NATIVE_WORKSPACE_PROBE_MARKER;
  if (turnResult.ok !== true) fail(`native probe turn failed: ${JSON.stringify(turnResult.error ?? null)}`);
  if (runtimeAdapterCallCount !== 0) fail("native probe used runtime adapter or fallback tools");
  if (failureSignals.length > 0) fail(`native probe failure signals: ${failureSignals.join(",")}`);
  if (!fileReadbackOk) fail(`native probe file readback failed: ${readback.output.slice(0, 500)}`);
  if (!assistantText.includes(NATIVE_WORKSPACE_PROBE_SENTINEL)) fail("native probe sentinel missing");
  if (!assistantText.includes(`file_contents=${NATIVE_WORKSPACE_PROBE_MARKER}`)) {
    fail("native probe did not report file contents");
  }
  return {
    ok: true,
    workspace_host_id: turnResult.workspace_host_id ?? null,
    workspace_root: turnResult.workspace_root ?? null,
    model_id: turnResult.model_id ?? null,
    tool_call_count: Array.isArray(turnResult.tool_calls) ? turnResult.tool_calls.length : 0,
    runtime_adapter_call_count: runtimeAdapterCallCount,
    native_file_readback_ok: fileReadbackOk,
    failure_signals: failureSignals,
  };
}

async function writeSnapshotReceipt(params: {
  sandbox: DaytonaSandbox;
  snapshotName: string;
  baseSnapshot: string;
}): Promise<Record<string, unknown>> {
  const branch = (await runLocal("git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  const head = (await runLocal("git", ["rev-parse", "HEAD"])).stdout.trim();
  const status = (await runLocal("git", ["status", "--short"])).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const receipt = {
    snapshot_name: params.snapshotName,
    base_snapshot: params.baseSnapshot,
    created_at: new Date().toISOString(),
    source_branch: branch,
    source_head: head,
    source_dirty_file_count: status.length,
    runtime_root: REMOTE_ROOT,
    workspace_root: REMOTE_WORKSPACE_ROOT,
    policy: DAYTONA_RUNTIME_POLICY,
  };
  await runRemoteBash(
    params.sandbox,
    [
      "set -euo pipefail",
      `printf %s ${shellQuote(JSON.stringify(receipt, null, 2))} > ${shellQuote(REMOTE_SNAPSHOT_RECEIPT)}`,
      `test -s ${shellQuote(REMOTE_SNAPSHOT_RECEIPT)}`,
    ].join("\n"),
    { cwd: REMOTE_ROOT, timeoutSeconds: 30 },
  );
  return receipt;
}

async function readSnapshotReceipt(sandbox: DaytonaSandbox): Promise<Record<string, unknown>> {
  const result = await runRemote(sandbox, `cat ${shellQuote(REMOTE_SNAPSHOT_RECEIPT)}`, {
    timeoutSeconds: 30,
  });
  return JSON.parse(result.output) as Record<string, unknown>;
}

async function cleanBeforeSnapshot(sandbox: DaytonaSandbox): Promise<void> {
  logStage("snapshot_clean");
  await runRemoteBash(
    sandbox,
    [
      "set -euo pipefail",
      `if test -f ${shellQuote(REMOTE_WORKER_PID)}; then kill "$(cat ${shellQuote(REMOTE_WORKER_PID)})" 2>/dev/null || true; fi`,
      `rm -f ${shellQuote(REMOTE_WORKER_PID)} ${shellQuote(REMOTE_WORKER_LOG)} ${shellQuote(REMOTE_TARBALL)}`,
      `mkdir -p ${shellQuote(REMOTE_WORKSPACE_ROOT)}`,
      `find ${shellQuote(REMOTE_WORKSPACE_ROOT)} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`,
    ].join("\n"),
    { timeoutSeconds: 60, allowFailure: true },
  );
}

async function cleanupSandbox(params: {
  daytona: DaytonaClient;
  sandbox: DaytonaSandbox | null;
  keepSandboxes: boolean;
}): Promise<void> {
  if (!params.sandbox || params.keepSandboxes) return;
  await runRemote(
    params.sandbox,
    `if test -f ${shellQuote(REMOTE_WORKER_PID)}; then kill "$(cat ${shellQuote(REMOTE_WORKER_PID)})" 2>/dev/null || true; fi`,
    { timeoutSeconds: 10, allowFailure: true },
  ).catch(() => undefined);
  if (typeof params.sandbox.delete === "function") {
    await params.sandbox.delete(120);
    return;
  }
  if (typeof params.daytona.delete === "function") {
    await params.daytona.delete(params.sandbox, 120);
  }
}

async function setConvexSnapshotEnv(snapshotName: string): Promise<void> {
  logStage("convex_env_update");
  await runLocal("npx", ["convex", "env", "set", "DAYTONA_SNAPSHOT", snapshotName], {
    env: {
      ...process.env,
      CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
    },
    maxBuffer: 1024 * 1024,
  });
  await runLocal("npx", ["convex", "env", "remove", "POLYNET_DAYTONA_DIRECT_SANDBOX_ID"], {
    env: {
      ...process.env,
      CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
    },
    allowFailure: true,
    maxBuffer: 1024 * 1024,
  });
  await runLocal("npx", ["convex", "env", "remove", "POLYNET_DAYTONA_DIRECT_LIFECYCLE_MODE"], {
    env: {
      ...process.env,
      CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
    },
    allowFailure: true,
    maxBuffer: 1024 * 1024,
  });
  const confirmed = await readConvexEnv("DAYTONA_SNAPSHOT");
  if (confirmed !== snapshotName) {
    fail(`Convex DAYTONA_SNAPSHOT did not update to ${snapshotName}`);
  }
}

export async function promoteDaytonaCodexRuntimeSnapshot(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  await runStagingGuard();
  const chatgptAuth = args.skipNativeProbe ? null : await readSmokeChatgptAuth();
  if (!args.skipNativeProbe && !chatgptAuth) {
    fail("Codex ChatGPT auth is required for native snapshot verification.");
  }
  const [{ Daytona }, daytonaConfig] = await Promise.all([loadDaytona(), buildDaytonaConfig()]);
  const daytona = new Daytona(daytonaConfig.config);
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "polynet-daytona-snapshot-"));
  let builderSandbox: DaytonaSandbox | null = null;
  let verifierSandbox: DaytonaSandbox | null = null;
  try {
    const tarball = await createWorktreeTarball(tmpDir);
    logStage("builder_sandbox_create");
    builderSandbox = await createSandboxFromSnapshot({
      daytona,
      snapshot: daytonaConfig.currentSnapshot,
      namePrefix: "polynet-codex-snapshot-build",
    });
    await ensureSandboxStarted(builderSandbox, 240);
    await installRuntimeIntoBuilder(builderSandbox, tarball);
    const builderRuntimeFiles = await verifyRuntimeFiles(builderSandbox);
    const builderToken = smokeWorkerAuthToken();
    await startWorkerFromSnapshot({ sandbox: builderSandbox, token: builderToken });
    const builderHealth = await waitForWorkerHealth({
      sandbox: builderSandbox,
      token: builderToken,
      timeoutMs: 120_000,
    });
    const builderWorkspaceProbe = await runWorkspaceProbe({
      sandbox: builderSandbox,
      token: builderToken,
    });
    const builderNativeProbe = args.skipNativeProbe
      ? null
      : await runNativeCodexWorkspaceProbe({
          sandbox: builderSandbox,
          token: builderToken,
          chatgptAuth: chatgptAuth as SmokeChatgptAuth,
        });
    const receipt = await writeSnapshotReceipt({
      sandbox: builderSandbox,
      snapshotName: args.snapshotName,
      baseSnapshot: daytonaConfig.currentSnapshot,
    });
    await cleanBeforeSnapshot(builderSandbox);
    if (typeof builderSandbox._experimental_createSnapshot !== "function") {
      fail("Daytona sandbox snapshot API is unavailable.");
    }
    logStage("snapshot_create");
    await builderSandbox._experimental_createSnapshot(args.snapshotName, 900);

    logStage("verifier_sandbox_create");
    verifierSandbox = await createSandboxFromSnapshot({
      daytona,
      snapshot: args.snapshotName,
      namePrefix: "polynet-codex-snapshot-verify",
    });
    await ensureSandboxStarted(verifierSandbox, 240);
    const verifierReceipt = await readSnapshotReceipt(verifierSandbox);
    if (verifierReceipt.snapshot_name !== args.snapshotName) {
      fail("snapshot verifier receipt did not match promoted snapshot name");
    }
    const verifierRuntimeFiles = await verifyRuntimeFiles(verifierSandbox);
    const verifierToken = smokeWorkerAuthToken();
    await startWorkerFromSnapshot({ sandbox: verifierSandbox, token: verifierToken });
    const verifierHealth = await waitForWorkerHealth({
      sandbox: verifierSandbox,
      token: verifierToken,
      timeoutMs: 120_000,
    });
    const verifierWorkspaceProbe = await runWorkspaceProbe({
      sandbox: verifierSandbox,
      token: verifierToken,
    });
    const verifierNativeProbe = args.skipNativeProbe
      ? null
      : await runNativeCodexWorkspaceProbe({
          sandbox: verifierSandbox,
          token: verifierToken,
          chatgptAuth: chatgptAuth as SmokeChatgptAuth,
        });
    if (args.updateConvexEnv) {
      await setConvexSnapshotEnv(args.snapshotName);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          snapshot_name: args.snapshotName,
          base_snapshot: daytonaConfig.currentSnapshot,
          convex_env_updated: args.updateConvexEnv,
          builder_sandbox_id: builderSandbox.id,
          verifier_sandbox_id: verifierSandbox.id,
          kept_sandboxes: args.keepSandboxes,
          receipt,
          builder: {
            runtime_files: {
              package_json: builderRuntimeFiles.package_json === true,
              node_modules: builderRuntimeFiles.node_modules === true,
              codex_cli: builderRuntimeFiles.codex_cli === true,
              worker_runner: builderRuntimeFiles.worker_runner === true,
            },
            codex_initialized: asRecord(builderHealth.codex)?.initialized === true,
            workspace_probe_ok: builderWorkspaceProbe.ok === true,
            native_probe: builderNativeProbe,
          },
          verifier_without_upload: {
            receipt_ok: verifierReceipt.snapshot_name === args.snapshotName,
            runtime_files: {
              package_json: verifierRuntimeFiles.package_json === true,
              node_modules: verifierRuntimeFiles.node_modules === true,
              codex_cli: verifierRuntimeFiles.codex_cli === true,
              worker_runner: verifierRuntimeFiles.worker_runner === true,
            },
            codex_initialized: asRecord(verifierHealth.codex)?.initialized === true,
            workspace_probe_ok: verifierWorkspaceProbe.ok === true,
            native_probe: verifierNativeProbe,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
    await cleanupSandbox({ daytona, sandbox: verifierSandbox, keepSandboxes: args.keepSandboxes }).catch(
      (error) => {
        const message = error instanceof Error ? error.message : String(error ?? "cleanup failed");
        process.stderr.write(`daytona_snapshot_verifier_cleanup_warning: ${message}\n`);
      },
    );
    await cleanupSandbox({ daytona, sandbox: builderSandbox, keepSandboxes: args.keepSandboxes }).catch(
      (error) => {
        const message = error instanceof Error ? error.message : String(error ?? "cleanup failed");
        process.stderr.write(`daytona_snapshot_builder_cleanup_warning: ${message}\n`);
      },
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  promoteDaytonaCodexRuntimeSnapshot().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error ?? "unknown error");
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
