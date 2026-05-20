import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTION_NAME = "builderPartners:backfillPartnerCommissionSettlementStateForOperator";
const STATUSES = new Set(["locked", "risk_hold", "payable", "voided"]);

type BackfillResult = {
  ok?: boolean;
  scanned?: number;
  recomputed?: number;
  nextAfterCreatedAt?: number | null;
  status?: string;
};

function readArgValue(name: string): string | null {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] ?? null;
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function parseNumberArg(name: string, fallback: number, args: { min: number; max?: number }): number {
  const raw = readArgValue(name);
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed < args.min || (args.max !== undefined && parsed > args.max)) {
    throw new Error(`invalid_${name.replace(/^--/, "").replace(/-/g, "_")}:${raw ?? fallback}`);
  }
  return Math.floor(parsed);
}

function parseOptionalNumberArg(name: string): number | undefined {
  const raw = readArgValue(name);
  if (raw === null) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`invalid_${name.replace(/^--/, "").replace(/-/g, "_")}:${raw}`);
  }
  return Math.floor(parsed);
}

function parseStatus(): string {
  const status = String(readArgValue("--status") ?? "").trim();
  if (!STATUSES.has(status)) {
    throw new Error("status_required:use --status locked|risk_hold|payable|voided");
  }
  return status;
}

function targetArgs(): { label: string; args: string[] } {
  const targetFlags = [
    hasArg("--dev") ? "--dev" : null,
    hasArg("--prod") ? "--prod" : null,
    readArgValue("--deployment-name") ? "--deployment-name" : null,
    readArgValue("--preview-name") ? "--preview-name" : null,
  ].filter(Boolean);
  if (targetFlags.length !== 1) {
    throw new Error("explicit_target_required:use exactly one of --dev, --prod, --deployment-name, or --preview-name");
  }
  if (hasArg("--dev")) return { label: "dev", args: [] };
  if (hasArg("--prod")) return { label: "prod", args: ["--prod"] };
  const deploymentName = readArgValue("--deployment-name");
  if (deploymentName) return { label: `deployment:${deploymentName}`, args: ["--deployment-name", deploymentName] };
  const previewName = readArgValue("--preview-name");
  if (previewName) return { label: `preview:${previewName}`, args: ["--preview-name", previewName] };
  throw new Error("explicit_target_required");
}

function readOperatorAuthSubject(): string {
  const authSubject =
    process.env.POLYNET_OPERATOR_AUTH_SUBJECT ??
    process.env.OPERATOR_AUTH_SUBJECT ??
    "";
  if (!authSubject.trim()) {
    throw new Error("operator_auth_subject_required:set POLYNET_OPERATOR_AUTH_SUBJECT or OPERATOR_AUTH_SUBJECT");
  }
  return authSubject.trim();
}

function parseConvexJsonOutput(functionName: string, stdout: string): BackfillResult {
  const output = stdout.trim();
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error(`convex_output_json_missing:${functionName}:${output.slice(0, 240)}`);
  }
  return JSON.parse(output.slice(firstBrace, lastBrace + 1)) as BackfillResult;
}

function runConvexMutation(args: {
  target: string[];
  authSubject: string;
  status: string;
  afterCreatedAt?: number;
  limit: number;
}): BackfillResult {
  const payload: Record<string, unknown> = {
    authSubject: args.authSubject,
    status: args.status,
    limit: args.limit,
  };
  if (args.afterCreatedAt !== undefined) payload.afterCreatedAt = args.afterCreatedAt;

  const result = spawnSync(
    "npx",
    [
      "convex",
      "run",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      ...args.target,
      FUNCTION_NAME,
      JSON.stringify(payload),
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`convex_run_failed:${result.status ?? 1}`);
  }
  return parseConvexJsonOutput(FUNCTION_NAME, result.stdout);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function main(): void {
  const status = parseStatus();
  const target = targetArgs();
  const limit = parseNumberArg("--limit", 100, { min: 1, max: 500 });
  const maxBatches = parseNumberArg("--max-batches", 100, { min: 1, max: 10000 });
  let afterCreatedAt = parseOptionalNumberArg("--after-created-at");
  const execute = hasArg("--execute");

  if (!execute) {
    printJson({
      ok: true,
      dryRun: true,
      mutatesData: false,
      functionName: FUNCTION_NAME,
      target: target.label,
      status,
      afterCreatedAt: afterCreatedAt ?? null,
      limit,
      maxBatches,
      nextStep: "Re-run with --execute and an operator auth subject after the target Convex deployment has this code.",
    });
    return;
  }

  const authSubject = readOperatorAuthSubject();
  const batches: BackfillResult[] = [];
  let totalScanned = 0;
  let totalRecomputed = 0;
  let complete = false;

  for (let index = 0; index < maxBatches; index += 1) {
    const previousAfterCreatedAt = afterCreatedAt;
    const result = runConvexMutation({
      target: target.args,
      authSubject,
      status,
      afterCreatedAt,
      limit,
    });
    batches.push(result);
    totalScanned += Number(result.scanned ?? 0);
    totalRecomputed += Number(result.recomputed ?? 0);

    if (Number(result.scanned ?? 0) <= 0) {
      complete = true;
      break;
    }

    const nextAfterCreatedAt = Number(result.nextAfterCreatedAt ?? 0);
    if (!Number.isFinite(nextAfterCreatedAt) || nextAfterCreatedAt <= 0) {
      throw new Error("backfill_checkpoint_missing");
    }
    if (previousAfterCreatedAt !== undefined && nextAfterCreatedAt <= previousAfterCreatedAt) {
      throw new Error("backfill_checkpoint_not_advancing");
    }
    afterCreatedAt = nextAfterCreatedAt;
  }

  printJson({
    ok: complete,
    target: target.label,
    status,
    limit,
    maxBatches,
    batches: batches.length,
    totalScanned,
    totalRecomputed,
    nextAfterCreatedAt: afterCreatedAt ?? null,
    complete,
  });

  if (!complete) {
    throw new Error(`backfill_incomplete:rerun_with --status ${status} --after-created-at ${afterCreatedAt}`);
  }
}

main();
