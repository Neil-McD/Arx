import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const targetArgs = buildTargetArgs();

function buildTargetArgs(): string[] {
  if (process.env.POLYNET_PARTNER_RUNTIME_SMOKE_PROD === "1") {
    if (process.env.POLYNET_PARTNER_RUNTIME_SMOKE_ALLOW_PROD !== "1") {
      throw new Error(
        "Refusing production partner retirement smoke without POLYNET_PARTNER_RUNTIME_SMOKE_ALLOW_PROD=1.",
      );
    }
    return ["--prod"];
  }
  const deploymentName = String(process.env.POLYNET_PARTNER_RUNTIME_SMOKE_DEPLOYMENT_NAME ?? "").trim();
  if (deploymentName) return ["--deployment-name", deploymentName];
  const previewName = String(process.env.POLYNET_PARTNER_RUNTIME_SMOKE_PREVIEW_NAME ?? "").trim();
  if (previewName) return ["--preview-name", previewName];
  return [];
}

function convexCommand(functionName: string, args: Record<string, unknown>): string[] {
  return [
    "convex",
    "run",
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    ...targetArgs,
    functionName,
    JSON.stringify(args),
  ];
}

function firstJsonOffset(output: string): number {
  const offsets = ["{", "[", '"', "null", "true", "false"]
    .map((marker) => output.indexOf(marker))
    .filter((offset) => offset >= 0);
  return offsets.length > 0 ? Math.min(...offsets) : -1;
}

function runConvex(functionName: string, args: Record<string, unknown>): unknown {
  const result = spawnSync("npx", convexCommand(functionName, args), {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`convex_run_failed:${functionName}`);
  }
  const output = result.stdout.trim();
  const jsonOffset = firstJsonOffset(output);
  assert.ok(jsonOffset >= 0, `expected ${functionName} to return JSON, got: ${output}`);
  return JSON.parse(output.slice(jsonOffset));
}

function runConvexExpectingRetirementError(functionName: string, args: Record<string, unknown>): void {
  const result = spawnSync("npx", convexCommand(functionName, args), {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0, `${functionName} must reject retired writes`);
  assert.match(output, /builder_partner_program_retired/);
}

const attribution = runConvex("builderPartners:recordBuilderPartnerAttribution", {
  referralCode: "retirement-smoke-no-write",
}) as { ok?: boolean; reason?: string };
assert.equal(attribution.ok, false);
assert.equal(attribution.reason, "builder_partner_program_retired");

runConvexExpectingRetirementError("builderPartners:acceptBuilderPartnerTermsAndEnsure", {
  termsVersion: "builder_partner_terms_v2",
});

const snapshot = runConvex("builderPartners:getMyBuilderPartnerProgram", {}) as {
  programStatus?: string;
  state?: string;
  partner?: unknown;
};
assert.equal(snapshot.programStatus, "retired");
assert.equal(snapshot.state, "retired");
assert.equal(snapshot.partner, null);

console.log(JSON.stringify({
  ok: true,
  programStatus: snapshot.programStatus,
  attributionReason: attribution.reason,
}));
console.log("PASS: Builder Partner v1 retirement smoke passed without writes");
