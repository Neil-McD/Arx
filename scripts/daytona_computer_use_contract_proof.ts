import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const liveSmoke = read("scripts/daytona_codex_runtime_live_smoke.ts");
const packageJson = read("package.json");
const computerUseOutputStart = liveSmoke.indexOf('mode: "computer_use_proof"');
const computerUseOutputEnd = liveSmoke.indexOf("return;", computerUseOutputStart);
const computerUseOutputBranch =
  computerUseOutputStart >= 0 && computerUseOutputEnd > computerUseOutputStart
    ? liveSmoke.slice(computerUseOutputStart, computerUseOutputEnd)
    : "";

assert.match(
  packageJson,
  /"check:daytona-computer-use-contract-proof"/,
  "package scripts must expose the Daytona Computer Use contract proof",
);

assert.match(
  liveSmoke,
  /computerUseProof:\s*boolean/,
  "live smoke args must expose an explicit computer-use proof mode",
);

assert.match(
  liveSmoke,
  /--computer-use-proof/,
  "live smoke must expose the computer-use proof as an explicit CLI flag",
);

assert.match(
  liveSmoke,
  /DAYTONA_COMPUTER_USE_PROOF/,
  "live smoke must expose the computer-use proof through an explicit env flag",
);

assert.match(
  liveSmoke,
  /sandbox\.computerUse/,
  "live smoke must prove Daytona Computer Use through the sandbox SDK object",
);

assert.match(
  liveSmoke,
  /computerUse\.start\(\)/,
  "live smoke must start the Daytona Computer Use session",
);

assert.match(
  liveSmoke,
  /computerUse\.stop\(\)/,
  "live smoke must stop the Daytona Computer Use session",
);

assert.match(
  liveSmoke,
  /takeCompressed[\s\S]*takeFullScreen/,
  "live smoke must support compressed screenshot and full-screen fallback",
);

assert.match(
  liveSmoke,
  /summarizeComputerUseScreenshot/,
  "live smoke must summarize screenshot evidence instead of printing image payloads",
);

assert.match(
  liveSmoke,
  /screenshot_size_bytes/,
  "computer-use proof output must expose screenshot byte-size evidence",
);

assert.match(
  liveSmoke,
  /screenshot_data_present/,
  "computer-use proof output must expose whether image data was returned",
);

assert.doesNotMatch(
  computerUseOutputBranch,
  /preview_url/,
  "computer-use proof output must not expose raw provider preview URLs",
);

assert.doesNotMatch(
  computerUseOutputBranch,
  /base64|screenshot_raw|image_data/,
  "computer-use proof output must not expose raw screenshot/image payloads",
);

console.log("daytona_computer_use_contract_proof: ok");
