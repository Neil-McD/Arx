import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type ProbeFailure = {
  ok: false;
  reason: string;
};

type BlaxelRuntimeWorkspaceToolsSmoke = {
  ok?: boolean;
  deploymentKind?: string;
  providerId?: string | null;
  projectId?: string | null;
  sandboxName?: string | null;
  volumeName?: string | null;
  evidence?: Record<string, boolean | undefined>;
  failures?: string[];
  errors?: unknown[];
};

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(reason: string): never {
  printJson({ ok: false, reason } satisfies ProbeFailure);
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
  let projectId = String(
    process.env.POLYNET_BLAXEL_RUNTIME_TOOLS_SMOKE_PROJECT_ID ?? "",
  ).trim();
  let shouldPush = true;
  let cleanupFile = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-push") {
      shouldPush = false;
      continue;
    }
    if (arg === "--keep-file") {
      cleanupFile = false;
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
    fail(`unknown_arg_${arg}`);
  }

  if (!projectId) {
    fail("missing_project_id");
  }

  return {
    projectId,
    shouldPush,
    cleanupFile,
  };
}

function validateSmoke(value: unknown): string[] {
  const smoke = value as BlaxelRuntimeWorkspaceToolsSmoke;
  const failures: string[] = [];
  if (smoke.ok !== true) failures.push("smoke_not_ok");
  if (smoke.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (smoke.providerId !== "blaxel") failures.push("blaxel_policy_not_selected");
  if (!smoke.projectId) failures.push("project_id_missing");
  if (!smoke.sandboxName) failures.push("sandbox_name_missing");
  if (!smoke.volumeName) failures.push("volume_name_missing");

  const expectedEvidence = [
    "providerPolicySelected",
    "projectLoaded",
    "providerOwnershipAccepted",
    "sessionEnsured",
    "providerOwnershipRecorded",
    "listDirOk",
    "writeOk",
    "readOk",
    "bashOk",
    "globOk",
    "grepOk",
    "sha256Ok",
    "editOk",
    "readAfterEditOk",
    "terminalStartOk",
    "terminalReadOk",
    "terminalPreviewOk",
    "terminalStopOk",
    "cleanupOk",
  ];
  for (const key of expectedEvidence) {
    if (smoke.evidence?.[key] !== true) {
      failures.push(`evidence_${key}_not_verified`);
    }
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

  const parsed = parseArgs(process.argv.slice(2));
  const convexArgs = [
    "convex",
    "run",
    "--deployment-name",
    deploymentName,
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...(parsed.shouldPush ? ["--push"] : []),
    "blaxelRuntimeWorkspaceToolsSmoke:smokeBlaxelRuntimeWorkspaceTools",
    JSON.stringify({
      projectId: parsed.projectId,
      cleanupFile: parsed.cleanupFile,
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
      reason: "blaxel_runtime_workspace_tools_smoke_failed",
      failures,
      smoke,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "blaxel_runtime_workspace_tools_smoke",
    pushed: parsed.shouldPush,
    smoke,
  });
}

main();
