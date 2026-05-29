import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type ProbeFailure = {
  ok: false;
  reason: string;
};

type WorkspaceUsageCardBillingSmoke = {
  ok?: boolean;
  deploymentKind?: string;
  amountCents?: number;
  evidence?: Record<string, boolean | undefined>;
  failures?: Array<{ code?: string; message?: string }>;
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
  const smoke = value as WorkspaceUsageCardBillingSmoke;
  const failures: string[] = [];
  if (smoke.ok !== true) failures.push("smoke_not_ok");
  if (smoke.deploymentKind !== "staging") failures.push("not_staging_deployment_kind");
  if (smoke.amountCents !== 50) failures.push("unexpected_smoke_amount_cents");
  const expectedEvidence = [
    "stagingOnly",
    "stripeTestMode",
    "stripeCustomerCreated",
    "stripePaymentMethodAttached",
    "smokeRowsCreated",
    "collectionRan",
    "collectionSucceeded",
    "balanceSettled",
    "paymentIntentVerified",
    "cleanupOk",
  ];
  for (const key of expectedEvidence) {
    if (smoke.evidence?.[key] !== true) failures.push(`evidence_${key}_not_verified`);
  }
  if (Array.isArray(smoke.failures) && smoke.failures.length > 0) {
    failures.push(
      ...smoke.failures.map((failure) => `remote_${failure.code ?? "unknown_failure"}`),
    );
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
    "workspaceUsageCardBillingSmoke:smokeWorkspaceUsageCardBilling",
    JSON.stringify({ uncollectedCredits: 50 }),
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
      reason: "workspace_usage_card_billing_smoke_failed",
      failures,
      smoke,
    });
    process.exit(1);
  }

  printJson({
    ok: true,
    probe: "workspace_usage_card_billing_smoke",
    pushed: shouldPush,
    smoke,
  });
}

main();
