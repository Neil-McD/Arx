import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";
const EXPECTED_DEPLOYMENT_KIND = "staging";

type ProbeArgs = {
  targetId: string;
};

type DaytonaClient = {
  get(sandboxIdOrName: string): Promise<DaytonaSandbox>;
};

type DaytonaSandbox = {
  id: string;
  name?: string;
  state?: string;
};

type DaytonaTarget = Record<string, unknown> & {
  _id?: string;
  sandboxId?: string;
  runId?: string;
};

type SweeperResult = {
  ok?: boolean;
  nowMs?: number;
  scanned?: number;
  deleted?: number;
  previewExpired?: number;
  skipped?: number;
  failed?: number;
};

function fail(message: string): never {
  throw new Error(message);
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function parseArgs(argv: string[]): ProbeArgs {
  let targetId = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--target-id") {
      targetId = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--target-id=")) {
      targetId = arg.slice("--target-id=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  if (!targetId) fail("missing required --target-id");
  return { targetId };
}

function assertStagingOnly(): void {
  if (readEnv("CONVEX_DEPLOY_KEY")) {
    fail("CONVEX_DEPLOY_KEY is set; cleanup probe must not run with deploy-key authority.");
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
    fail("DAYTONA_API_KEY or DAYTONA_JWT_TOKEN is required for provider deletion verification.");
  }
  if (readEnv("DAYTONA_JWT_TOKEN") && !readEnv("DAYTONA_ORGANIZATION_ID")) {
    fail("DAYTONA_ORGANIZATION_ID is required when DAYTONA_JWT_TOKEN is used.");
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requireNumber(value: unknown, label: string): number {
  const parsed = readNumber(value);
  if (parsed <= 0) fail(`${label} must be a positive number.`);
  return parsed;
}

function parseConvexJson<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed === "null") return null as T;
  const start = trimmed.search(/[\[{]/);
  if (start < 0) fail(`convex output did not contain JSON: ${trimmed.slice(0, 500)}`);
  return JSON.parse(trimmed.slice(start)) as T;
}

async function runConvex<T>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await execFileAsync(
    "npx",
    [
      "convex",
      "run",
      functionName,
      JSON.stringify(args),
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    {
      env: {
        ...process.env,
        CONVEX_DEPLOYMENT: EXPECTED_CONVEX_DEPLOYMENT,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return parseConvexJson<T>(result.stdout);
}

async function readTarget(targetId: string): Promise<DaytonaTarget> {
  const target = await runConvex<DaytonaTarget | null>(
    "daytonaCodexRuntimeTargets:getDaytonaCodexRuntimeTargetByIdInternal",
    { targetId },
  );
  if (!target) fail(`Daytona Codex runtime target not found: ${targetId}`);
  return target;
}

async function runTargetedSweeper(targetId: string, nowMs: number): Promise<SweeperResult> {
  return await runConvex<SweeperResult>(
    "daytonaCodexRuntimeTargetActions:sweepExpiredDaytonaCodexRuntimeTargetsInternal",
    {
      targetId,
      nowMs,
      limit: 1,
    },
  );
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

function isDaytonaNotFoundError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /not found|\b404\b/i.test(message);
}

async function requireSandboxPresent(daytona: DaytonaClient, sandboxId: string): Promise<DaytonaSandbox> {
  try {
    return await daytona.get(sandboxId);
  } catch (error) {
    fail(`Daytona sandbox was deleted too early: ${sandboxId}`);
  }
}

async function requireSandboxDeleted(daytona: DaytonaClient, sandboxId: string): Promise<void> {
  try {
    await daytona.get(sandboxId);
  } catch (error) {
    if (isDaytonaNotFoundError(error)) return;
    throw error;
  }
  fail(`Daytona sandbox still exists after retention expiry: ${sandboxId}`);
}

function assertInitialTarget(target: DaytonaTarget): {
  sandboxId: string;
  previewLeaseExpiresAt: number;
} {
  const sandboxId = readString(target.sandboxId);
  if (!sandboxId) fail("target must have a sandboxId.");
  if (readString(target.workerState) !== "released") {
    fail(`target workerState must be released, got ${readString(target.workerState) || "<empty>"}.`);
  }
  if (readString(target.leaseRunId)) {
    fail("target still has leaseRunId; only released targets are cleanup eligible.");
  }
  if (readString(target.lifecycleMode) === "prepared_staging_reuse") {
    fail("prepared staging reuse targets are intentionally skipped by cleanup.");
  }
  if (readString(target.previewLeaseState) !== "active") {
    fail(`target previewLeaseState must be active, got ${readString(target.previewLeaseState) || "<empty>"}.`);
  }
  const activePreviewPorts = Array.isArray(target.activePreviewPorts)
    ? target.activePreviewPorts.filter((port) => Number(port) > 0)
    : [];
  if (activePreviewPorts.length === 0) {
    fail("target must have at least one activePreviewPort.");
  }
  const previewLeaseExpiresAt = requireNumber(
    target.previewLeaseExpiresAt,
    "target.previewLeaseExpiresAt",
  );
  const retentionExpiresAt = readNumber(target.workspaceRetentionExpiresAt);
  if (
    readString(target.workspaceRetentionState) === "human_save_pending" &&
    retentionExpiresAt > 0 &&
    retentionExpiresAt <= previewLeaseExpiresAt + 1
  ) {
    fail("target retention is already expired at preview expiry; refusing ambiguous cleanup probe.");
  }
  return { sandboxId, previewLeaseExpiresAt };
}

function assertPreviewExpiryResult(result: SweeperResult): void {
  if (result.ok !== true) fail(`preview expiry sweep failed: ${JSON.stringify(result)}`);
  if (result.scanned !== 1) fail(`preview expiry sweep scanned ${result.scanned}, expected 1.`);
  if (result.previewExpired !== 1) {
    fail(`preview expiry sweep previewExpired ${result.previewExpired}, expected 1.`);
  }
  if (Number(result.failed ?? 0) !== 0) {
    fail(`preview expiry sweep failed count was ${result.failed}.`);
  }
}

function assertStoppedForHumanSave(target: DaytonaTarget): number {
  if (readString(target.previewLeaseState) !== "expired") {
    fail(`previewLeaseState must be expired, got ${readString(target.previewLeaseState) || "<empty>"}.`);
  }
  if (readString(target.providerTeardownState) !== "stopped") {
    fail(
      `providerTeardownState must be stopped after preview expiry, got ${
        readString(target.providerTeardownState) || "<empty>"
      }.`,
    );
  }
  if (readString(target.sandboxState) !== "stopped") {
    fail(`sandboxState must be stopped after preview expiry, got ${readString(target.sandboxState) || "<empty>"}.`);
  }
  if (readString(target.workspaceChangeState) !== "dirty") {
    fail(`workspaceChangeState must be dirty, got ${readString(target.workspaceChangeState) || "<empty>"}.`);
  }
  if (readString(target.workspaceRetentionState) !== "human_save_pending") {
    fail(
      `workspaceRetentionState must be human_save_pending, got ${
        readString(target.workspaceRetentionState) || "<empty>"
      }.`,
    );
  }
  if (readString(target.cleanupDecision) !== "stop_for_human_save") {
    fail(`cleanupDecision must be stop_for_human_save, got ${readString(target.cleanupDecision) || "<empty>"}.`);
  }
  if (readNumber(target.workspaceMeaningfulFileCount) < 1) {
    fail("workspaceMeaningfulFileCount must show at least one meaningful file.");
  }
  return requireNumber(target.workspaceRetentionExpiresAt, "workspaceRetentionExpiresAt");
}

function assertRetentionExpiryResult(result: SweeperResult): void {
  if (result.ok !== true) fail(`retention expiry sweep failed: ${JSON.stringify(result)}`);
  if (result.scanned !== 1) fail(`retention expiry sweep scanned ${result.scanned}, expected 1.`);
  if (result.deleted !== 1) fail(`retention expiry sweep deleted ${result.deleted}, expected 1.`);
  if (Number(result.failed ?? 0) !== 0) {
    fail(`retention expiry sweep failed count was ${result.failed}.`);
  }
}

function assertDeletedAfterRetention(target: DaytonaTarget): void {
  if (readString(target.providerTeardownState) !== "deleted") {
    fail(`providerTeardownState must be deleted, got ${readString(target.providerTeardownState) || "<empty>"}.`);
  }
  if (readString(target.sandboxState) !== "deleted") {
    fail(`sandboxState must be deleted, got ${readString(target.sandboxState) || "<empty>"}.`);
  }
  if (readString(target.workspaceRetentionState) !== "expired") {
    fail(
      `workspaceRetentionState must be expired, got ${readString(target.workspaceRetentionState) || "<empty>"}.`,
    );
  }
  if (readString(target.cleanupDecision) !== "delete_expired_retention") {
    fail(`cleanupDecision must be delete_expired_retention, got ${readString(target.cleanupDecision) || "<empty>"}.`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertStagingOnly();

  const { Daytona } = await loadDaytona();
  const daytona = new Daytona(buildDaytonaConfig());
  const initialTarget = await readTarget(args.targetId);
  const { sandboxId, previewLeaseExpiresAt } = assertInitialTarget(initialTarget);
  await requireSandboxPresent(daytona, sandboxId);

  const previewSweepNowMs = previewLeaseExpiresAt + 1;
  const previewSweep = await runTargetedSweeper(args.targetId, previewSweepNowMs);
  assertPreviewExpiryResult(previewSweep);

  const afterPreviewExpiry = await readTarget(args.targetId);
  const retentionExpiresAt = assertStoppedForHumanSave(afterPreviewExpiry);
  const stoppedSandbox = await requireSandboxPresent(daytona, sandboxId);

  const retentionSweepNowMs = retentionExpiresAt + 1;
  const retentionSweep = await runTargetedSweeper(args.targetId, retentionSweepNowMs);
  assertRetentionExpiryResult(retentionSweep);

  const afterRetentionExpiry = await readTarget(args.targetId);
  assertDeletedAfterRetention(afterRetentionExpiry);
  await requireSandboxDeleted(daytona, sandboxId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        target_id: args.targetId,
        run_id: readString(initialTarget.runId),
        sandbox_id: sandboxId,
        preview_sweep: previewSweep,
        retention_sweep: retentionSweep,
        stopped_sandbox_state: readString(stoppedSandbox.state) || null,
        final_provider_teardown_state: readString(afterRetentionExpiry.providerTeardownState),
        final_sandbox_state: readString(afterRetentionExpiry.sandboxState),
        final_workspace_retention_state: readString(afterRetentionExpiry.workspaceRetentionState),
        final_cleanup_decision: readString(afterRetentionExpiry.cleanupDecision),
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
