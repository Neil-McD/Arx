import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type ProbeFailure = {
  ok: false;
  reason: string;
};

type BlaxelConvexSandboxSmoke = {
  ok?: boolean;
  deploymentKind?: string;
  providerId?: string | null;
  sandboxName?: string | null;
  evidence?: {
    providerPolicySelected?: boolean;
    sandboxEnsured?: boolean;
    fileWritten?: boolean;
    fileReadBack?: boolean;
    commandRan?: boolean;
    directoryListed?: boolean;
    cleanupOk?: boolean;
  };
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

function validateSmoke(value: unknown): string[] {
  const smoke = value as BlaxelConvexSandboxSmoke;
  const failures: string[] = [];
  if (smoke.ok !== true) failures.push("smoke_not_ok");
  if (smoke.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (smoke.providerId !== "blaxel") failures.push("blaxel_policy_not_selected");
  if (!smoke.sandboxName) failures.push("sandbox_name_missing");
  if (smoke.evidence?.providerPolicySelected !== true) failures.push("provider_policy_not_verified");
  if (smoke.evidence?.sandboxEnsured !== true) failures.push("sandbox_not_ensured");
  if (smoke.evidence?.fileWritten !== true) failures.push("file_not_written");
  if (smoke.evidence?.fileReadBack !== true) failures.push("file_not_read_back");
  if (smoke.evidence?.commandRan !== true) failures.push("command_not_verified");
  if (smoke.evidence?.directoryListed !== true) failures.push("directory_not_listed");
  if (smoke.evidence?.cleanupOk !== true) failures.push("cleanup_not_confirmed");
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
    "blaxelWorkspaceSandboxSmoke:smokeBlaxelConvexSandbox",
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
      reason: "blaxel_convex_sandbox_smoke_failed",
      failures,
      smoke,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "blaxel_convex_sandbox_smoke",
    pushed: shouldPush,
    smoke,
  });
}

main();
