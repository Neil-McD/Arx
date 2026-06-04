import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  buildCodexBridgeSmokeRunId,
  mintCodexBridgeOperatorToken,
} from "./codex_bridge_operator_token.ts";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type CodexExecSmoke = {
  ok?: boolean;
  deploymentKind?: string;
  projectId?: string;
  threadId?: string;
  ownerId?: string | null;
  runId?: string;
  sandboxName?: string | null;
  evidence?: Record<string, boolean | undefined>;
  failures?: string[];
  errors?: unknown[];
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

function parseArgs(argv: string[]) {
  let projectId = String(process.env.POLYNET_CODEX_BRIDGE_PROJECT_ID ?? "").trim();
  let threadId = String(process.env.POLYNET_CODEX_BRIDGE_THREAD_ID ?? "").trim();
  let baseUrl = String(process.env.POLYNET_CODEX_BRIDGE_BASE_URL ?? "").trim();
  let runId = String(process.env.POLYNET_CODEX_BRIDGE_RUN_ID ?? "").trim();
  let prompt = String(process.env.POLYNET_CODEX_EXEC_PROMPT ?? "").trim();
  let operatorSecret = String(process.env.POLYNET_CODEX_BRIDGE_OPERATOR_SECRET ?? "").trim();
  let shouldPush = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-push") {
      shouldPush = false;
      continue;
    }
    if (arg === "--project-id") {
      projectId = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--project-id=")) {
      projectId = arg.slice("--project-id=".length).trim();
      continue;
    }
    if (arg === "--thread-id") {
      threadId = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--thread-id=")) {
      threadId = arg.slice("--thread-id=".length).trim();
      continue;
    }
    if (arg === "--base-url") {
      baseUrl = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).trim();
      continue;
    }
    if (arg === "--run-id") {
      runId = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--run-id=")) {
      runId = arg.slice("--run-id=".length).trim();
      continue;
    }
    if (arg === "--prompt") {
      prompt = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--prompt=")) {
      prompt = arg.slice("--prompt=".length).trim();
      continue;
    }
    fail(`unknown_arg_${arg}`);
  }

  if (!projectId) fail("missing_project_id");
  if (!threadId) fail("missing_thread_id");
  if (!operatorSecret) fail("missing_operator_secret");
  runId = buildCodexBridgeSmokeRunId("codex_bridge_codex_exec", runId);
  const operatorToken = mintCodexBridgeOperatorToken({
    secret: operatorSecret,
    action: "codex_bridge_codex_exec_smoke",
    runId,
    projectId,
    threadId,
    baseUrl,
  });

  return {
    projectId,
    threadId,
    baseUrl,
    runId,
    prompt,
    operatorToken,
    shouldPush,
  };
}

function validateSmoke(value: unknown): string[] {
  const smoke = value as CodexExecSmoke;
  const failures: string[] = [];
  if (smoke.ok !== true) failures.push("smoke_not_ok");
  if (smoke.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (!smoke.projectId) failures.push("project_id_missing");
  if (!smoke.threadId) failures.push("thread_id_missing");
  if (!smoke.ownerId) failures.push("owner_id_missing");
  if (!smoke.runId) failures.push("run_id_missing");
  if (!smoke.sandboxName) failures.push("sandbox_name_missing");

  for (const key of [
    "stagingOnly",
    "operatorAuthorized",
    "providerPolicySelected",
    "projectLoaded",
    "codexAuthAvailable",
    "sandboxEnsured",
    "runStarted",
    "tokenMinted",
    "commandRan",
    "contextCallbackOk",
    "codexCliInvoked",
    "codexJsonlStreamStarted",
    "codexJsonlParsed",
    "codexFinalCaptured",
    "eventCallbackOk",
    "finishCallbackOk",
    "ledgerEventVisible",
    "runFinished",
  ]) {
    if (smoke.evidence?.[key] !== true) failures.push(`evidence_${key}_not_verified`);
  }

  if (Array.isArray(smoke.failures) && smoke.failures.length > 0) {
    failures.push(...smoke.failures.map((failure) => `remote_${failure}`));
  }
  if (Array.isArray(smoke.errors) && smoke.errors.length > 0) {
    failures.push("remote_errors_present");
  }
  return failures;
}

function main() {
  const deploymentName = String(process.env.CONVEX_DEPLOYMENT ?? "").trim();
  if (deploymentName !== EXPECTED_CONVEX_DEPLOYMENT) {
    fail(`CONVEX_DEPLOYMENT must be ${EXPECTED_CONVEX_DEPLOYMENT}`);
  }
  const deploymentCliName = deploymentName.replace(/^dev:/, "");
  const parsed = parseArgs(process.argv.slice(2));

  const convexArgs = [
    "convex",
    "run",
    "--deployment-name",
    deploymentCliName,
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...(parsed.shouldPush ? ["--push"] : []),
    "codexBridgeCodexExecSmoke:smokeCodexBridgeCodexExec",
    JSON.stringify({
      projectId: parsed.projectId,
      threadId: parsed.threadId,
      operatorToken: parsed.operatorToken,
      ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : null),
      runId: parsed.runId,
      ...(parsed.prompt ? { prompt: parsed.prompt } : null),
    }),
  ];

  const childEnv = { ...process.env };
  delete childEnv.POLYNET_CODEX_BRIDGE_OPERATOR_SECRET;
  const result = spawnSync("npx", convexArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv,
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
      reason: "codex_bridge_codex_exec_smoke_failed",
      failures,
      smoke,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "codex_bridge_codex_exec_smoke",
    pushed: parsed.shouldPush,
    smoke,
  });
}

main();
