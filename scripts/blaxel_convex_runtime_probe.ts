import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type ProbeFailure = {
  ok: false;
  reason: string;
};

type BlaxelConvexRuntimeDiagnostic = {
  ok?: boolean;
  deploymentKind?: string;
  policy?: {
    providerId?: string;
    reason?: string;
  };
  env?: {
    blWorkspacePresent?: boolean;
    blApiKeyPresent?: boolean;
  };
  sdk?: {
    importAttempted?: boolean;
    importOk?: boolean;
    sandboxInstanceExport?: boolean;
    volumeInstanceExport?: boolean;
  };
  noSandboxCreated?: boolean;
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

function validateDiagnostic(value: unknown): string[] {
  const diagnostic = value as BlaxelConvexRuntimeDiagnostic;
  const failures: string[] = [];
  if (diagnostic.ok !== true) failures.push("diagnostic_not_ok");
  if (diagnostic.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (diagnostic.policy?.providerId !== "blaxel") failures.push("blaxel_policy_not_selected");
  if (diagnostic.env?.blWorkspacePresent !== true) failures.push("remote_bl_workspace_missing");
  if (diagnostic.env?.blApiKeyPresent !== true) failures.push("remote_bl_api_key_missing");
  if (diagnostic.sdk?.importAttempted !== true) failures.push("sdk_import_not_attempted");
  if (diagnostic.sdk?.importOk !== true) failures.push("sdk_import_failed");
  if (diagnostic.sdk?.sandboxInstanceExport !== true) failures.push("sandbox_instance_export_missing");
  if (diagnostic.sdk?.volumeInstanceExport !== true) failures.push("volume_instance_export_missing");
  if (diagnostic.noSandboxCreated !== true) failures.push("diagnostic_may_have_created_sandbox");
  return failures;
}

function main() {
  const deploymentName = String(process.env.CONVEX_DEPLOYMENT ?? "").trim();
  if (deploymentName !== EXPECTED_CONVEX_DEPLOYMENT) {
    fail(`CONVEX_DEPLOYMENT must be ${EXPECTED_CONVEX_DEPLOYMENT}`);
  }

  const shouldPush = !new Set(process.argv.slice(2)).has("--no-push");
  const convexArgs = [
    "convex",
    "run",
    "--deployment-name",
    deploymentName,
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...(shouldPush ? ["--push"] : []),
    "blaxelWorkspaceDiagnostics:diagnoseBlaxelConvexRuntime",
    "{}",
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

  let diagnostic: unknown;
  try {
    diagnostic = parseConvexJson(result.stdout);
  } catch (error) {
    if (result.stdout) process.stdout.write(result.stdout);
    fail(error instanceof Error ? error.message : "convex_run_parse_failed");
  }

  const failures = validateDiagnostic(diagnostic);
  if (failures.length > 0) {
    printJson({
      ok: false,
      reason: "blaxel_convex_runtime_probe_failed",
      failures,
      diagnostic,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "blaxel_convex_runtime",
    pushed: shouldPush,
    diagnostic,
  });
}

main();
