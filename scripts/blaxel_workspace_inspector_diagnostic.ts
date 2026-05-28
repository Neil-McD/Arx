import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type CliArgs = {
  projectId: string;
  authSubject?: string;
  ownerId?: string;
  path?: string;
  runList: boolean;
  shouldPush: boolean;
};

type ProbeFailure = {
  ok: false;
  reason: string;
  usage?: string;
};

type InspectorDiagnostic = {
  ok?: boolean;
  deploymentKind?: string;
  policy?: {
    providerId?: string;
    reason?: string;
  };
  project?: {
    providerVolumeId?: string | null;
    providerVolumeProviderId?: string | null;
    providerSandboxId?: string | null;
    providerSandboxProviderId?: string | null;
  };
  expectedNames?: {
    sandboxName?: string;
    volumeName?: string;
  };
  expectedSandboxRecorded?: boolean;
  expectedVolumeRecorded?: boolean;
  listResult?: {
    ok?: boolean;
    providerId?: string | null;
    entryCount?: number;
  } | null;
  refreshedProject?: {
    providerVolumeId?: string | null;
    providerVolumeProviderId?: string | null;
    providerSandboxId?: string | null;
    providerSandboxProviderId?: string | null;
  } | null;
};

function usage() {
  return [
    "Usage:",
    "  npm run diagnose:blaxel-workspace-inspector -- --project-id <cloudProjectId> --auth-subject <subject> [--owner-id <userId>] [--path .] [--no-push]",
    "  npm run diagnose:blaxel-workspace-inspector -- --project-id <cloudProjectId> --owner-id <userId> --no-list [--no-push]",
  ].join("\n");
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(reason: string, includeUsage = false): never {
  printJson({
    ok: false,
    reason,
    ...(includeUsage ? { usage: usage() } : null),
  } satisfies ProbeFailure);
  process.exit(1);
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${flag}_value_required`, true);
  }
  return value;
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: Partial<CliArgs> = {
    runList: true,
    shouldPush: true,
    path: ".",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project-id") {
      parsed.projectId = readFlagValue(argv, index, "project_id");
      index += 1;
    } else if (arg === "--auth-subject") {
      parsed.authSubject = readFlagValue(argv, index, "auth_subject");
      index += 1;
    } else if (arg === "--owner-id") {
      parsed.ownerId = readFlagValue(argv, index, "owner_id");
      index += 1;
    } else if (arg === "--path") {
      parsed.path = readFlagValue(argv, index, "path");
      index += 1;
    } else if (arg === "--no-list") {
      parsed.runList = false;
    } else if (arg === "--no-push") {
      parsed.shouldPush = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      fail(`unknown_arg:${arg}`, true);
    }
  }
  if (!parsed.projectId) fail("project_id_required", true);
  if (parsed.runList && !parsed.authSubject) {
    fail("auth_subject_required_for_list_diagnostic", true);
  }
  if (!parsed.authSubject && !parsed.ownerId) {
    fail("auth_subject_or_owner_id_required", true);
  }
  return parsed as CliArgs;
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

function validateDiagnostic(value: unknown, args: CliArgs): string[] {
  const diagnostic = value as InspectorDiagnostic;
  const failures: string[] = [];
  if (diagnostic.ok !== true) failures.push("diagnostic_not_ok");
  if (diagnostic.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (diagnostic.policy?.providerId !== "blaxel") failures.push("blaxel_policy_not_selected");
  if (!diagnostic.expectedNames?.sandboxName) failures.push("expected_sandbox_name_missing");
  if (!diagnostic.expectedNames?.volumeName) failures.push("expected_volume_name_missing");
  if (!args.runList) {
    if (diagnostic.expectedSandboxRecorded !== true) failures.push("unexpected_project_sandbox_pointer");
    if (diagnostic.expectedVolumeRecorded !== true) failures.push("unexpected_project_volume_pointer");
  }
  if (args.runList) {
    if (diagnostic.listResult?.ok !== true) failures.push("workspace_inspector_list_not_ok");
    if (diagnostic.listResult?.providerId !== "blaxel") failures.push("workspace_inspector_list_not_blaxel");
    if (typeof diagnostic.listResult?.entryCount !== "number") {
      failures.push("workspace_inspector_entry_count_missing");
    }
    if (!diagnostic.refreshedProject?.providerVolumeId) {
      failures.push("project_volume_not_recorded_after_list");
    }
    if (diagnostic.refreshedProject?.providerVolumeProviderId !== "blaxel") {
      failures.push("project_volume_provider_not_blaxel_after_list");
    }
    if (!diagnostic.refreshedProject?.providerSandboxId) {
      failures.push("project_sandbox_not_recorded_after_list");
    }
    if (diagnostic.refreshedProject?.providerSandboxProviderId !== "blaxel") {
      failures.push("project_sandbox_provider_not_blaxel_after_list");
    }
    if (
      diagnostic.expectedNames?.volumeName &&
      diagnostic.refreshedProject?.providerVolumeId !== diagnostic.expectedNames.volumeName
    ) {
      failures.push("project_volume_not_reconciled_after_list");
    }
    if (
      diagnostic.expectedNames?.sandboxName &&
      diagnostic.refreshedProject?.providerSandboxId !== diagnostic.expectedNames.sandboxName
    ) {
      failures.push("project_sandbox_not_reconciled_after_list");
    }
  }
  return failures;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const deploymentName = String(process.env.CONVEX_DEPLOYMENT ?? "").trim();
  if (deploymentName !== EXPECTED_CONVEX_DEPLOYMENT) {
    fail(`CONVEX_DEPLOYMENT must be ${EXPECTED_CONVEX_DEPLOYMENT}`);
  }
  const deploymentCliName = deploymentName.replace(/^dev:/, "");

  const payload = {
    projectId: args.projectId,
    ...(args.authSubject ? { authSubject: args.authSubject } : null),
    ...(args.ownerId ? { ownerId: args.ownerId } : null),
    path: args.path ?? ".",
    runList: args.runList,
  };

  const convexArgs = [
    "convex",
    "run",
    "--deployment-name",
    deploymentCliName,
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...(args.shouldPush ? ["--push"] : []),
    "blaxelWorkspaceInspectorDiagnostics:diagnoseBlaxelWorkspaceInspectorProject",
    JSON.stringify(payload),
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

  const failures = validateDiagnostic(diagnostic, args);
  if (failures.length > 0) {
    printJson({
      ok: false,
      reason: "blaxel_workspace_inspector_diagnostic_failed",
      failures,
      diagnostic,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "blaxel_workspace_inspector_diagnostic",
    pushed: args.shouldPush,
    diagnostic,
  });
}

main();
