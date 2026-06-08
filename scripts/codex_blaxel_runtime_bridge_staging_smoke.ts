import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type RuntimeBridgeSmoke = {
  ok?: boolean;
  runId?: string | null;
  modelId?: string | null;
  sandboxName?: string | null;
  volumeName?: string | null;
  destroyedAfterRun?: boolean | null;
  eventSummary?: {
    eventCount?: number;
    eventTypes?: string[];
    assistantTextChars?: number;
    hasAssistantTextDelta?: boolean;
    hasRunFinished?: boolean;
  } | null;
  failure?: {
    code?: string;
    message?: string;
  } | null;
};

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(reason: string): never {
  printJson({ ok: false, reason });
  process.exit(1);
}

function parseConvexJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("convex_run_returned_empty_stdout");
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
    }
    throw new Error("convex_run_returned_non_json_stdout");
  }
}

function readArgValue(name: string): string {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return String(match?.slice(prefix.length) ?? "").trim();
}

function hasFlag(name: string): boolean {
  return new Set(process.argv.slice(2)).has(name);
}

function validateSmoke(value: unknown): string[] {
  const smoke = value as RuntimeBridgeSmoke;
  const failures: string[] = [];
  if (smoke.ok !== true) failures.push("smoke_not_ok");
  if (!smoke.runId) failures.push("run_id_missing");
  if (!smoke.sandboxName) failures.push("sandbox_name_missing");
  if (smoke.eventSummary?.hasAssistantTextDelta !== true) failures.push("assistant_text_delta_missing");
  if (smoke.eventSummary?.hasRunFinished !== true) failures.push("run_finished_missing");
  if (!Number.isFinite(Number(smoke.eventSummary?.assistantTextChars)) || Number(smoke.eventSummary?.assistantTextChars) <= 0) {
    failures.push("assistant_text_chars_missing");
  }
  if (smoke.failure?.code) failures.push(`remote_${smoke.failure.code}`);
  return failures;
}

function main() {
  const deploymentName = String(process.env.CONVEX_DEPLOYMENT ?? "").trim();
  if (deploymentName !== EXPECTED_CONVEX_DEPLOYMENT) {
    fail(`CONVEX_DEPLOYMENT must be ${EXPECTED_CONVEX_DEPLOYMENT}`);
  }
  const authSubject =
    readArgValue("--auth-subject") ||
    String(process.env.POLYNET_CODEX_RUNTIME_SMOKE_AUTH_SUBJECT ?? "").trim();
  if (!authSubject) {
    fail("POLYNET_CODEX_RUNTIME_SMOKE_AUTH_SUBJECT or --auth-subject=<subject> is required");
  }
  const threadId =
    readArgValue("--thread-id") ||
    String(process.env.POLYNET_CODEX_RUNTIME_SMOKE_THREAD_ID ?? "").trim();
  if (!threadId) {
    fail("POLYNET_CODEX_RUNTIME_SMOKE_THREAD_ID or --thread-id=<threadId> is required");
  }
  const prompt =
    readArgValue("--prompt") ||
    String(process.env.POLYNET_CODEX_RUNTIME_SMOKE_PROMPT ?? "").trim() ||
    "Reply with exactly POLYNET_CODEX_RUNTIME_BRIDGE_OK.";
  const shouldPush =
    hasFlag("--push") ||
    String(process.env.POLYNET_CODEX_RUNTIME_SMOKE_PUSH ?? "").trim() === "1";
  const destroyAfterRun = !hasFlag("--keep-sandbox");
  const deploymentCliName = deploymentName.replace(/^dev:/, "");

  const convexArgs = [
    "convex",
    "run",
    "--deployment-name",
    deploymentCliName,
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...(shouldPush ? ["--push"] : []),
    "blaxelCodexRuntimeTurn:runBlaxelCodexRuntimeTurn",
    JSON.stringify({
      authSubject,
      threadId,
      prompt,
      destroyAfterRun,
    }),
  ];

  const result = spawnSync("npx", convexArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });

  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    fail(`convex_run_failed_${result.status ?? "unknown"}`);
  }

  let smoke: unknown;
  try {
    smoke = parseConvexJson(result.stdout);
  } catch (error) {
    if (result.stdout) process.stdout.write(result.stdout);
    fail(error instanceof Error ? error.message : "convex_run_parse_failed");
  }

  const failures = validateSmoke(smoke);
  if (failures.length > 0) {
    printJson({
      ok: false,
      reason: "codex_blaxel_runtime_bridge_staging_smoke_failed",
      failures,
      smoke,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "codex_blaxel_runtime_bridge_staging_smoke",
    pushed: shouldPush,
    destroyAfterRun,
    smoke,
  });
}

main();
