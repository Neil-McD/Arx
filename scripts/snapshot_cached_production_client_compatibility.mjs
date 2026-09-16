import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const PRODUCTION_ORIGIN = "https://polynet.ai";
const STAGING_DEPLOYMENT = "quick-porcupine-949";
const DEFAULT_OUTPUT =
  "shared/contracts/cached_production_client_compatibility_v1.json";

function parseArgs(argv) {
  const outputArg = argv.find((value) => value.startsWith("--output="));
  return {
    output: outputArg?.slice("--output=".length) || DEFAULT_OUTPUT,
  };
}

function readFunctionSpec(args) {
  const result = spawnSync("npx", ["convex", "function-spec", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || "convex_function_spec_failed"),
    );
  }
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.functions)) {
    throw new Error("convex_function_spec_missing_functions");
  }
  return parsed.functions.filter(
    (entry) => entry?.visibility?.kind === "public",
  );
}

async function readProductionArtifact() {
  const versionResponse = await fetch(
    new URL("/version.json", PRODUCTION_ORIGIN),
  );
  if (!versionResponse.ok) {
    throw new Error(`production_version_failed:${versionResponse.status}`);
  }
  const version = await versionResponse.json();
  const buildId = String(version?.buildId ?? "").trim();
  if (!/^[0-9a-f]{40}$/.test(buildId)) {
    throw new Error("production_build_id_invalid");
  }

  const queue = ["/"];
  const seen = new Set();
  const sources = [];
  while (queue.length > 0) {
    const path = queue.shift();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const response = await fetch(new URL(path, PRODUCTION_ORIGIN));
    if (!response.ok) {
      throw new Error(`production_asset_failed:${path}:${response.status}`);
    }
    const source = await response.text();
    sources.push(source);
    for (const match of source.matchAll(
      /(?:["'`]?)((?:\/|\.\/)?assets\/[A-Za-z0-9._-]+\.js)/g,
    )) {
      const normalized = match[1].startsWith("/")
        ? match[1]
        : `/${match[1].replace(/^\.\//, "")}`;
      if (!seen.has(normalized)) queue.push(normalized);
    }
  }

  const candidates = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(
      /["'`]([A-Za-z][A-Za-z0-9_./-]*:[A-Za-z][A-Za-z0-9_]*)["'`]/g,
    )) {
      candidates.add(match[1]);
    }
  }
  return {
    buildId,
    assetPaths: [...seen].sort(),
    candidates,
  };
}

function callName(identifier) {
  return String(identifier).replace(/\.js:/, ":");
}


async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await readProductionArtifact();
  const productionFunctions = readFunctionSpec(["--prod"]);
  const productionCalls = new Set(productionFunctions.map((entry) => callName(entry.identifier)));
  // Generated function references need not appear as literal module:function
  // strings in bundles. Keep reviewed production call sites explicit.
  const supplementalCalls = {
    "communityInteractions:createCommunityInteractionComposerMessage": "shared/cloudCommunityInteractionsGateway.ts",
  };
  const required = [...new Set([...artifact.candidates, ...Object.keys(supplementalCalls)])]
    .filter((call) => productionCalls.has(call))
    .sort();
  const contract = {
    contract_id: "cached_production_client_compatibility_v1",
    version: 1,
    production_origin: PRODUCTION_ORIGIN,
    production_build_id: artifact.buildId,
    staging_deployment: STAGING_DEPLOYMENT,
    production_asset_paths: artifact.assetPaths,
    supplemental_operation_sources: supplementalCalls,
    required_public_operations: required,
    production_function_contracts: Object.fromEntries(required.map((call) => {
      const entry = productionFunctions.find((row) => callName(row.identifier) === call);
      return [call, { args: entry.args, functionType: entry.functionType }];
    })),

  };
  const finalVersionResponse = await fetch(new URL("/version.json", PRODUCTION_ORIGIN));
  if (!finalVersionResponse.ok || (await finalVersionResponse.json()).buildId !== artifact.buildId) {
    throw new Error("production_build_changed_during_snapshot");
  }
  const outputPath = resolve(ROOT, options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: options.output,
        production_build_id: artifact.buildId,
        required: required.length,
        note: "Production request snapshot only; run candidate compatibility proof separately.",
      },
      null,
      2,
    ),
  );
}

await main();
