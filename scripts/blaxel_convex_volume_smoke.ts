import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";
const ACCEPTABLE_BLOCKING_CODE = "blaxel_volume_quota_exceeded";

type ProbeFailure = {
  ok: false;
  reason: string;
};

type BlaxelConvexVolumeSmoke = {
  ok?: boolean;
  blocked?: boolean;
  blockingCode?: string | null;
  deploymentKind?: string;
  providerId?: string | null;
  volumeName?: string | null;
  hotSandboxName?: string | null;
  coldSandboxName?: string | null;
  volumeCleanupMode?: string;
  evidence?: {
    providerPolicySelected?: boolean;
    hotSandboxEnsured?: boolean;
    markerWritten?: boolean;
    hotMarkerReadBack?: boolean;
    hotSandboxDestroyed?: boolean;
    coldSandboxEnsured?: boolean;
    coldMarkerReadBack?: boolean;
    coldDirectoryListed?: boolean;
    coldSandboxDestroyed?: boolean;
    volumeDestroyed?: boolean;
  };
  failures?: string[];
  errors?: Array<{ code?: string; message?: string; status?: number }>;
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

function isAcceptableQuotaBlock(smoke: BlaxelConvexVolumeSmoke): boolean {
  const errorCodes = new Set(
    (smoke.errors ?? []).map((error) => String(error.code ?? "")),
  );
  return (
    smoke.blocked === true &&
    smoke.blockingCode === ACCEPTABLE_BLOCKING_CODE &&
    errorCodes.has(ACCEPTABLE_BLOCKING_CODE) &&
    smoke.evidence?.providerPolicySelected === true &&
    smoke.evidence?.hotSandboxDestroyed === true &&
    smoke.evidence?.coldSandboxDestroyed === true &&
    smoke.volumeCleanupMode === "not_created"
  );
}

function validateSuccess(smoke: BlaxelConvexVolumeSmoke): string[] {
  const failures: string[] = [];
  if (smoke.ok !== true) failures.push("smoke_not_ok");
  if (smoke.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (smoke.providerId !== "blaxel") failures.push("blaxel_policy_not_selected");
  if (smoke.volumeName !== "polynet-blaxel-convex-volume-smoke") {
    failures.push("unexpected_volume_name");
  }
  if (!smoke.hotSandboxName) failures.push("hot_sandbox_name_missing");
  if (!smoke.coldSandboxName) failures.push("cold_sandbox_name_missing");
  if (smoke.volumeCleanupMode !== "destroyed_after_smoke") {
    failures.push("unexpected_volume_cleanup_mode");
  }
  if (smoke.evidence?.providerPolicySelected !== true) failures.push("provider_policy_not_verified");
  if (smoke.evidence?.hotSandboxEnsured !== true) failures.push("hot_sandbox_not_ensured");
  if (smoke.evidence?.markerWritten !== true) failures.push("marker_not_written");
  if (smoke.evidence?.hotMarkerReadBack !== true) failures.push("hot_marker_not_read_back");
  if (smoke.evidence?.hotSandboxDestroyed !== true) failures.push("hot_cleanup_not_confirmed");
  if (smoke.evidence?.coldSandboxEnsured !== true) failures.push("cold_sandbox_not_ensured");
  if (smoke.evidence?.coldMarkerReadBack !== true) failures.push("cold_marker_not_read_back");
  if (smoke.evidence?.coldDirectoryListed !== true) failures.push("cold_directory_not_listed");
  if (smoke.evidence?.coldSandboxDestroyed !== true) failures.push("cold_cleanup_not_confirmed");
  if (smoke.evidence?.volumeDestroyed !== true) failures.push("volume_cleanup_not_confirmed");
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

  const shouldPush = !new Set(process.argv.slice(2)).has("--no-push");
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
    "blaxelWorkspaceVolumeSmoke:smokeBlaxelConvexVolume",
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

  const typedSmoke = smoke as BlaxelConvexVolumeSmoke;
  if (isAcceptableQuotaBlock(typedSmoke)) {
    printJson({
      ok: true,
      blocked: true,
      reason: ACCEPTABLE_BLOCKING_CODE,
      probe: "blaxel_convex_volume_smoke",
      pushed: shouldPush,
      smoke,
    });
    return;
  }

  const failures = validateSuccess(typedSmoke);
  if (failures.length > 0) {
    printJson({
      ok: false,
      reason: "blaxel_convex_volume_smoke_failed",
      failures,
      smoke,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    blocked: false,
    probe: "blaxel_convex_volume_smoke",
    pushed: shouldPush,
    smoke,
  });
}

main();
