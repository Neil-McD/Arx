import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const PRODUCTION_ORIGIN = "https://polynet.ai";
const STAGING_DEPLOYMENT = "quick-porcupine-949";
const DEFAULT_OUTPUT =
  "shared/contracts/cached_production_client_compatibility_v1.json";
const COMPATIBILITY_MODULES = new Set([
  "appOAuth",
  "billing",
  "community",
  "harnessMounts",
  "userPlatformAppMounts",
]);

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

function moduleName(call) {
  return String(call).split(":")[0];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await readProductionArtifact();
  const productionFunctions = readFunctionSpec(["--prod"]);
  const stagingFunctions = readFunctionSpec([
    "--deployment",
    STAGING_DEPLOYMENT,
  ]);
  const productionCalls = new Set(
    productionFunctions.map((entry) => callName(entry.identifier)),
  );
  const stagingCalls = new Set(
    stagingFunctions.map((entry) => callName(entry.identifier)),
  );
  const stagingByExportName = new Map();
  for (const entry of stagingFunctions) {
    const call = callName(entry.identifier);
    if (COMPATIBILITY_MODULES.has(moduleName(call))) continue;
    const exportName = call.split(":")[1];
    const rows = stagingByExportName.get(exportName) ?? [];
    rows.push(call);
    stagingByExportName.set(exportName, rows);
  }

  const required = [...artifact.candidates]
    .filter((call) => productionCalls.has(call))
    .sort();
  const alreadySupported = required
    .filter(
      (call) =>
        stagingCalls.has(call) &&
        !COMPATIBILITY_MODULES.has(moduleName(call)),
    )
    .sort();
  const aliases = {};
  const retiredOperations = [];
  for (const call of required) {
    if (
      stagingCalls.has(call) &&
      !COMPATIBILITY_MODULES.has(moduleName(call))
    ) {
      continue;
    }
    const candidates = stagingByExportName.get(call.split(":")[1]) ?? [];
    if (candidates.length === 1) {
      aliases[call] = candidates[0];
    } else {
      retiredOperations.push(call);
    }
  }

  const contract = {
    contract_id: "cached_production_client_compatibility_v1",
    version: 1,
    production_origin: PRODUCTION_ORIGIN,
    production_build_id: artifact.buildId,
    staging_deployment: STAGING_DEPLOYMENT,
    production_asset_paths: artifact.assetPaths,
    required_public_operations: required,
    candidate_already_supported_operations: alreadySupported,
    compatibility_aliases: Object.fromEntries(
      Object.entries(aliases).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    retired_tombstone_operations: retiredOperations.sort(),
  };
  const outputPath = resolve(ROOT, options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: options.output,
        production_build_id: artifact.buildId,
        required: required.length,
        already_supported: alreadySupported.length,
        aliases: Object.keys(aliases).length,
        retired_tombstones: retiredOperations.length,
      },
      null,
      2,
    ),
  );
}

await main();
