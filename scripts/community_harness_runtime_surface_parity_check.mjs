import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertDeepEqual(actual, expected, message) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) fail(`${message}: expected=${right} actual=${left}`);
}

async function readJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readText(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return fs.readFile(filePath, "utf8");
}

function extractConstString(source, pattern, missingMessage) {
  const match = source.match(pattern);
  if (!match || typeof match[1] !== "string" || match[1].trim() === "") {
    fail(missingMessage);
  }
  return match[1].trim();
}

function extractStringArray(source, pattern, missingMessage) {
  const match = source.match(pattern);
  if (!match || typeof match[1] !== "string") {
    fail(missingMessage);
  }
  const body = match[1];
  const values = [];
  const regex = /"([^"]+)"/g;
  let item = regex.exec(body);
  while (item) {
    values.push(item[1]);
    item = regex.exec(body);
  }
  return values;
}

async function main() {
  const contract = await readJson("shared/contracts/community_harness_capabilities_v3.json");
  const desktopTools = Array.isArray(contract?.runtime_exposed_tools?.desktop)
    ? contract.runtime_exposed_tools.desktop
    : null;
  const webTools = Array.isArray(contract?.runtime_exposed_tools?.web)
    ? contract.runtime_exposed_tools.web
    : null;

  assert(contract?.id === "community_harness_capabilities_v3", "community harness contract id mismatch");
  assert(contract?.version === 3, "community harness contract version mismatch");
  assert(Array.isArray(desktopTools), "runtime_exposed_tools.desktop must be an array");
  assert(Array.isArray(webTools), "runtime_exposed_tools.web must be an array");
  assert(desktopTools.length > 0, "runtime_exposed_tools.desktop must not be empty");
  assert(webTools.length > 0, "runtime_exposed_tools.web must not be empty");
  assertDeepEqual(webTools, desktopTools, "desktop/web runtime tools parity mismatch in contract");

  const rustMain = await readText("src-tauri/src/main.rs");
  const edgeIndex = await readText("supabase/functions/agent_turn/index.ts");

  assert(
    rustMain.includes("community_harness_capabilities_v3.json"),
    "desktop runtime is not loading shared community harness contract",
  );
  assert(
    rustMain.includes(".runtime_exposed_tools") && rustMain.includes(".desktop"),
    "desktop runtime is not deriving tool allowlist from contract runtime_exposed_tools.desktop",
  );

  const edgeContractId = extractConstString(
    edgeIndex,
    /const COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID = "([^"]+)";/m,
    "edge COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID constant not found",
  );
  assert(edgeContractId === contract.id, "edge community harness contract id mismatch");

  const edgeRuntimeTools = extractStringArray(
    edgeIndex,
    /const COMMUNITY_HARNESS_RUNTIME_TOOLS = Object\.freeze\(\[(.*?)\] as const\);/s,
    "edge COMMUNITY_HARNESS_RUNTIME_TOOLS constant not found",
  );
  assertDeepEqual(edgeRuntimeTools, webTools, "edge runtime tools mismatch vs contract runtime_exposed_tools.web");

  assert(
    edgeIndex.includes("community_harness_runtime_tools"),
    "edge response/meta payload missing community_harness_runtime_tools",
  );

  console.log("PASS: community harness runtime surface parity checks passed.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
