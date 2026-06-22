import { randomBytes } from "node:crypto";
import {
  DAYTONA_CODEX_WORKSPACE_ROOT,
  DAYTONA_RUNTIME_POLICY,
} from "../shared/daytonaCodexRuntimePolicy.ts";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";
const EXPECTED_DEPLOYMENT_KIND = "staging";
const MARKER_FILE = `${DAYTONA_CODEX_WORKSPACE_ROOT}/polynet-stop-resume-marker.txt`;

type ProbeArgs = {
  compareEphemeral: boolean;
};

type DaytonaClient = {
  create(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<DaytonaSandbox>;
  get(sandboxIdOrName: string): Promise<DaytonaSandbox>;
  delete?(sandbox: DaytonaSandbox, timeout?: number): Promise<void>;
};

type DaytonaSandbox = {
  id: string;
  name?: string;
  state?: string;
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
  stop?(timeout?: number, force?: boolean): Promise<void>;
  waitUntilStarted?(timeout?: number): Promise<void>;
  delete?(timeout?: number): Promise<void>;
};

type PersistenceResult = {
  ok: boolean;
  ephemeral: boolean;
  sandbox_id: string;
  sandbox_name: string | null;
  marker_readback_ok: boolean;
  resolved_after_stop: boolean;
  state_after_stop: string | null;
  state_after_restart: string | null;
  delete_ok: boolean;
  expected_failure?: boolean;
  failure_stage?: string;
  failure_message?: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function parseArgs(argv: string[]): ProbeArgs {
  let compareEphemeral = false;
  for (const arg of argv) {
    if (arg === "--compare-ephemeral") {
      compareEphemeral = true;
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return { compareEphemeral };
}

function assertStagingOnly(): void {
  if (readEnv("CONVEX_DEPLOY_KEY")) {
    fail("CONVEX_DEPLOY_KEY is set; provider probe must not run with deploy-key authority.");
  }
  if (readEnv("CONVEX_DEPLOYMENT") !== EXPECTED_CONVEX_DEPLOYMENT) {
    fail(
      `CONVEX_DEPLOYMENT must be ${EXPECTED_CONVEX_DEPLOYMENT}, got ${
        readEnv("CONVEX_DEPLOYMENT") || "<empty>"
      }`,
    );
  }
  if (readEnv("POLYNET_DEPLOYMENT_KIND") !== EXPECTED_DEPLOYMENT_KIND) {
    fail(
      `POLYNET_DEPLOYMENT_KIND must be ${EXPECTED_DEPLOYMENT_KIND}, got ${
        readEnv("POLYNET_DEPLOYMENT_KIND") || "<empty>"
      }`,
    );
  }
  if (!readEnv("DAYTONA_API_KEY") && !readEnv("DAYTONA_JWT_TOKEN")) {
    fail("DAYTONA_API_KEY or DAYTONA_JWT_TOKEN is required.");
  }
  if (readEnv("DAYTONA_JWT_TOKEN") && !readEnv("DAYTONA_ORGANIZATION_ID")) {
    fail("DAYTONA_ORGANIZATION_ID is required when DAYTONA_JWT_TOKEN is used.");
  }
}

function buildDaytonaConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [envName, configName] of [
    ["DAYTONA_API_KEY", "apiKey"],
    ["DAYTONA_API_URL", "apiUrl"],
    ["DAYTONA_TARGET", "target"],
    ["DAYTONA_JWT_TOKEN", "jwtToken"],
    ["DAYTONA_ORGANIZATION_ID", "organizationId"],
  ] as const) {
    const value = readEnv(envName);
    if (value) config[configName] = value;
  }
  return config;
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandOutput(result: { result?: string; artifacts?: { stdout?: string } }): string {
  return String(result.result ?? "") || String(result.artifacts?.stdout ?? "");
}

function isDaytonaNotFoundError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /not found|\b404\b/i.test(message);
}

async function runRemote(
  sandbox: DaytonaSandbox,
  command: string,
  options?: {
    cwd?: string;
    timeoutSeconds?: number;
    allowFailure?: boolean;
  },
): Promise<{ exitCode: number; output: string }> {
  const result = await sandbox.process.executeCommand(
    command,
    options?.cwd,
    undefined,
    options?.timeoutSeconds ?? 60,
  );
  const output = commandOutput(result);
  if (!options?.allowFailure && result.exitCode !== 0) {
    fail(
      [
        "daytona_remote_command_failed",
        `exit_code=${result.exitCode}`,
        `command=${command.slice(0, 300)}`,
        `output=${output.slice(0, 2000)}`,
      ].join("\n"),
    );
  }
  return { exitCode: result.exitCode, output };
}

async function ensureStarted(sandbox: DaytonaSandbox): Promise<DaytonaSandbox> {
  if (sandbox.state !== "started" && typeof sandbox.start === "function") {
    await sandbox.start(180);
    return sandbox;
  }
  await sandbox.waitUntilStarted?.(180);
  return sandbox;
}

async function deleteSandbox(daytona: DaytonaClient, sandbox: DaytonaSandbox): Promise<boolean> {
  try {
    if (typeof sandbox.delete === "function") {
      await sandbox.delete(120);
      return true;
    }
    if (typeof daytona.delete === "function") {
      await daytona.delete(sandbox, 120);
      return true;
    }
    return false;
  } catch (error) {
    if (isDaytonaNotFoundError(error)) return true;
    throw error;
  }
}

async function createProbeSandbox(params: {
  daytona: DaytonaClient;
  ephemeral: boolean;
}): Promise<DaytonaSandbox> {
  const suffix = randomBytes(5).toString("hex");
  return await params.daytona.create(
    {
      language: "typescript",
      name: `polynet-stop-resume-${params.ephemeral ? "ephemeral" : "persistent"}-${Date.now()}-${suffix}`,
      labels: {
        app: "polynet",
        purpose: "daytona-stop-resume-persistence-probe",
        environment: "staging-spike",
        ephemeral: String(params.ephemeral),
      },
      public: DAYTONA_RUNTIME_POLICY.daytonaSandbox.publicPreview,
      autoStopInterval: DAYTONA_RUNTIME_POLICY.daytonaSandbox.autoStopIntervalMinutes,
      ephemeral: params.ephemeral,
    },
    { timeout: 240 },
  );
}

async function runPersistenceCase(params: {
  daytona: DaytonaClient;
  ephemeral: boolean;
  expectedFailure: boolean;
}): Promise<PersistenceResult> {
  let sandbox = await createProbeSandbox({
    daytona: params.daytona,
    ephemeral: params.ephemeral,
  });
  let deleteOk = false;
  let failureStage = "";
  let failureMessage = "";
  try {
    sandbox = await ensureStarted(sandbox);
    const marker = `polynet-stop-resume-${params.ephemeral ? "ephemeral" : "persistent"}-${Date.now()}`;
    await runRemote(
      sandbox,
      [
        "bash",
        "-lc",
        shellQuote(
          [
            "set -euo pipefail",
            `mkdir -p ${shellQuote(DAYTONA_CODEX_WORKSPACE_ROOT)}`,
            `printf ${shellQuote(marker)} > ${shellQuote(MARKER_FILE)}`,
            `cat ${shellQuote(MARKER_FILE)}`,
          ].join("\n"),
        ),
      ].join(" "),
      { timeoutSeconds: 30 },
    );
    if (typeof sandbox.stop !== "function") {
      fail("daytona_sandbox_stop_unavailable");
    }
    await sandbox.stop(120, true);

    let afterStop: DaytonaSandbox;
    try {
      afterStop = await params.daytona.get(sandbox.id);
    } catch (error) {
      failureStage = "get_after_stop";
      failureMessage = error instanceof Error ? error.message : String(error ?? "unknown error");
      if (!params.expectedFailure) throw error;
      return {
        ok: true,
        ephemeral: params.ephemeral,
        sandbox_id: sandbox.id,
        sandbox_name: sandbox.name ?? null,
        marker_readback_ok: false,
        resolved_after_stop: false,
        state_after_stop: null,
        state_after_restart: null,
        delete_ok: true,
        expected_failure: true,
        failure_stage: failureStage,
        failure_message: failureMessage.slice(0, 500),
      };
    }

    const stateAfterStop = String(afterStop.state ?? "") || null;
    if (typeof afterStop.start !== "function") {
      fail("daytona_sandbox_start_unavailable_after_stop");
    }
    await afterStop.start(180);
    await afterStop.waitUntilStarted?.(180);
    const afterRestart = await params.daytona.get(sandbox.id);
    const readback = await runRemote(afterRestart, `cat ${shellQuote(MARKER_FILE)}`, {
      timeoutSeconds: 30,
      allowFailure: true,
    });
    const markerReadbackOk = readback.exitCode === 0 && readback.output.trim() === marker;
    if (!markerReadbackOk && !params.expectedFailure) {
      fail(`marker readback failed after restart: ${readback.output.slice(0, 500)}`);
    }
    deleteOk = await deleteSandbox(params.daytona, afterRestart);
    return {
      ok: markerReadbackOk,
      ephemeral: params.ephemeral,
      sandbox_id: sandbox.id,
      sandbox_name: sandbox.name ?? null,
      marker_readback_ok: markerReadbackOk,
      resolved_after_stop: true,
      state_after_stop: stateAfterStop,
      state_after_restart: String(afterRestart.state ?? "") || null,
      delete_ok: deleteOk,
    };
  } catch (error) {
    failureStage ||= "probe";
    failureMessage ||= error instanceof Error ? error.message : String(error ?? "unknown error");
    try {
      deleteOk = await deleteSandbox(params.daytona, sandbox);
    } catch {
      deleteOk = false;
    }
    if (params.expectedFailure) {
      return {
        ok: true,
        ephemeral: params.ephemeral,
        sandbox_id: sandbox.id,
        sandbox_name: sandbox.name ?? null,
        marker_readback_ok: false,
        resolved_after_stop: false,
        state_after_stop: null,
        state_after_restart: null,
        delete_ok: deleteOk,
        expected_failure: true,
        failure_stage: failureStage,
        failure_message: failureMessage.slice(0, 500),
      };
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertStagingOnly();
  const { Daytona } = await loadDaytona();
  const daytona = new Daytona(buildDaytonaConfig());

  const persistent = await runPersistenceCase({
    daytona,
    ephemeral: false,
    expectedFailure: false,
  });
  if (!persistent.ok || !persistent.marker_readback_ok || !persistent.resolved_after_stop) {
    fail(`non-ephemeral stop/resume persistence failed: ${JSON.stringify(persistent)}`);
  }

  const ephemeral = args.compareEphemeral
    ? await runPersistenceCase({
        daytona,
        ephemeral: true,
        expectedFailure: true,
      })
    : null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        conclusion:
          "Daytona non-ephemeral sandboxes preserve workspace files across stop/start.",
        persistent,
        ...(ephemeral ? { ephemeral_comparison: ephemeral } : {}),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  console.error(`FAIL: ${message}`);
  process.exit(1);
});
