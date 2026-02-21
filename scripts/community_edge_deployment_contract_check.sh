#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST_PATH="$ROOT_DIR/supabase/functions/deployment-manifest.json"
FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"

echo "== Community edge deployment contract check =="

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "FAIL: missing deployment manifest at $MANIFEST_PATH"
  exit 1
fi

EXPECTED_FILE="$(mktemp)"
trap 'rm -f "$EXPECTED_FILE"' EXIT

MANIFEST_PATH="$MANIFEST_PATH" FUNCTIONS_DIR="$FUNCTIONS_DIR" EXPECTED_FILE="$EXPECTED_FILE" node <<'NODE'
const fs = require("fs");
const path = require("path");

const manifestPath = process.env.MANIFEST_PATH;
const functionsDir = process.env.FUNCTIONS_DIR;
const expectedFile = process.env.EXPECTED_FILE;

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

if (!manifestPath || !functionsDir || !expectedFile) {
  fail("internal script error: missing environment variables");
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`unable to parse deployment manifest (${error.message})`);
}

const active = Array.isArray(manifest?.active_functions) ? manifest.active_functions : null;
if (!active || active.length === 0) {
  fail("deployment manifest must contain a non-empty active_functions array");
}
const inactive = Array.isArray(manifest?.inactive_functions) ? manifest.inactive_functions : [];

const activeMap = new Map();
for (const entry of active) {
  const slug = String(entry?.slug ?? "").trim();
  if (!slug) fail("manifest contains an entry with empty slug");
  if (activeMap.has(slug)) fail(`manifest active_functions contains duplicate slug '${slug}'`);
  if (typeof entry?.verify_jwt !== "boolean") {
    fail(`manifest active entry '${slug}' must set boolean verify_jwt`);
  }
  activeMap.set(slug, entry.verify_jwt);
}

const inactiveMap = new Map();
for (const entry of inactive) {
  const slug = String(entry?.slug ?? "").trim();
  if (!slug) fail("manifest contains an inactive entry with empty slug");
  if (inactiveMap.has(slug)) fail(`manifest inactive_functions contains duplicate slug '${slug}'`);
  if (activeMap.has(slug)) fail(`manifest slug '${slug}' cannot be both active and inactive`);
  if (typeof entry?.verify_jwt !== "boolean") {
    fail(`manifest inactive entry '${slug}' must set boolean verify_jwt`);
  }
  inactiveMap.set(slug, entry.verify_jwt);
}

let dirEntries;
try {
  dirEntries = fs.readdirSync(functionsDir, { withFileTypes: true });
} catch (error) {
  fail(`unable to read functions directory (${error.message})`);
}

const localDeployable = dirEntries
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  .filter((slug) => fs.existsSync(path.join(functionsDir, slug, "index.ts")))
  .sort();

const activeExpected = [...activeMap.keys()].sort();
const inactiveExpected = [...inactiveMap.keys()].sort();
const declared = [...new Set([...activeExpected, ...inactiveExpected])].sort();

const missingLocal = declared.filter((slug) => !localDeployable.includes(slug));
const unexpectedLocal = localDeployable.filter((slug) => !declared.includes(slug));

if (missingLocal.length > 0) {
  fail(`missing deployable function directories required by manifest (active/inactive): ${missingLocal.join(", ")}`);
}
if (unexpectedLocal.length > 0) {
  fail(`unexpected deployable function directories not declared active/inactive in manifest: ${unexpectedLocal.join(", ")}`);
}

for (const [slug, expectedVerifyJwt] of [...activeMap.entries(), ...inactiveMap.entries()]) {
  const configPath = path.join(functionsDir, slug, "config.toml");
  if (!fs.existsSync(configPath)) {
    fail(`missing config.toml for '${slug}' (verify_jwt must be explicit)`);
  }
  const content = fs.readFileSync(configPath, "utf8");
  const match = content.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/m);
  if (!match) {
    fail(`config.toml for '${slug}' is missing a valid verify_jwt assignment`);
  }
  const actualVerifyJwt = match[1] === "true";
  if (actualVerifyJwt !== expectedVerifyJwt) {
    fail(
      `verify_jwt mismatch for '${slug}': expected ${expectedVerifyJwt}, found ${actualVerifyJwt}`,
    );
  }
}

fs.writeFileSync(
  expectedFile,
  JSON.stringify({
    active_slugs: activeExpected,
    inactive_slugs: inactiveExpected,
    verify_jwt: Object.fromEntries([...activeMap.entries()]),
  }),
  "utf8",
);
console.log(
  `PASS: local function surface + verify_jwt posture match manifest (active=${activeExpected.length}, inactive=${inactiveExpected.length}).`,
);
NODE

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" && -f ".env" ]]; then
  SUPABASE_URL_LINE="$(grep -E '^VITE_SUPABASE_URL=' .env | head -n1 || true)"
  SUPABASE_URL="${SUPABASE_URL_LINE#VITE_SUPABASE_URL=}"
  if [[ "$SUPABASE_URL" =~ ^https://([a-z0-9]+)\.supabase\.co/?$ ]]; then
    PROJECT_REF="${BASH_REMATCH[1]}"
  fi
fi

if [[ -z "$PROJECT_REF" ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "FAIL: remote deployment check requires SUPABASE_PROJECT_REF in CI."
    exit 1
  fi
  echo "SKIP: remote deployment check (no SUPABASE_PROJECT_REF / VITE_SUPABASE_URL)."
  exit 0
fi

if ! command -v supabase >/dev/null 2>&1; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "FAIL: supabase CLI is required in CI for remote deployment parity checks."
    exit 1
  fi
  echo "SKIP: remote deployment check (supabase CLI not installed)."
  exit 0
fi

FUNCTIONS_JSON="$({
  supabase --workdir "$ROOT_DIR" functions list --project-ref "$PROJECT_REF" --output json
} 2>/dev/null || true)"

EXPECTED_FILE="$EXPECTED_FILE" FUNCTIONS_JSON="$FUNCTIONS_JSON" node <<'NODE'
const fs = require("fs");

const expectedPath = process.env.EXPECTED_FILE;
const raw = process.env.FUNCTIONS_JSON ?? "";

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

if (!expectedPath || !fs.existsSync(expectedPath)) {
  fail("internal script error: missing expected slug file");
}

const expectedPayload = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
const active = Array.isArray(expectedPayload?.active_slugs) ? expectedPayload.active_slugs : [];
const inactive = Array.isArray(expectedPayload?.inactive_slugs) ? expectedPayload.inactive_slugs : [];
const expectedVerify = expectedPayload?.verify_jwt ?? {};
if (active.length === 0 || typeof expectedVerify !== "object" || Array.isArray(expectedVerify)) {
  fail("internal script error: expected function set is empty");
}

if (!raw.trim()) {
  fail("unable to read deployed functions from Supabase project");
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  fail(`could not parse 'supabase functions list' output (${error.message})`);
}

const rows = Array.isArray(parsed)
  ? parsed
  : Array.isArray(parsed?.result)
    ? parsed.result
    : [];

const deployed = [...new Set(
  rows
    .map((row) => String(row?.slug ?? row?.name ?? "").trim())
    .filter((slug) => slug.length > 0)
)].sort();

const missingActive = active.filter((slug) => !deployed.includes(slug));
const deployedInactive = deployed.filter((slug) => inactive.includes(slug));
const unknownDeployed = deployed.filter((slug) => !active.includes(slug) && !inactive.includes(slug));

if (missingActive.length > 0) {
  fail(`deployed project missing active manifest functions: ${missingActive.join(", ")}`);
}
if (deployedInactive.length > 0) {
  fail(`deployed project has inactive manifest functions still deployed: ${deployedInactive.join(", ")}`);
}
if (unknownDeployed.length > 0) {
  fail(`deployed project has undeclared functions (not active/inactive in manifest): ${unknownDeployed.join(", ")}`);
}

const deployedBySlug = new Map(rows.map((row) => [String(row?.slug ?? row?.name ?? "").trim(), row]));
const verifyMismatches = [];
for (const slug of active) {
  const row = deployedBySlug.get(slug);
  const expectedValue = expectedVerify[slug];
  const actualValue = row?.verify_jwt;
  if (typeof actualValue !== "boolean") {
    verifyMismatches.push(`${slug} (missing verify_jwt in API response)`);
    continue;
  }
  if (actualValue !== expectedValue) {
    verifyMismatches.push(`${slug} (expected ${expectedValue}, found ${actualValue})`);
  }
}
if (verifyMismatches.length > 0) {
  fail(`deployed verify_jwt mismatch: ${verifyMismatches.join("; ")}`);
}

console.log(
  `PASS: deployed function set + verify_jwt posture match manifest (active=${active.length}, inactive=${inactive.length}).`,
);
NODE
