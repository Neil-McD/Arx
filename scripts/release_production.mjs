import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ReleaseError,
  renderReleaseReceipt,
  runProductionRelease,
  runProductionRollback,
} from "./lib/releaseProduction.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return [
    "Usage:",
    "  npm run release:prod                  verify, deploy Convex then web, prove live",
    "  npm run release:verify                guards, release gate, and preflight only",
    "  npm run release:rollback -- <dpl_id>  web-only rollback to a recorded deployment",
  ].join("\n");
}

const deps = {
  env: process.env,
  now: () => Date.now(),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  log: (entry) => console.log(`[release] ${JSON.stringify(entry)}`),
  readJson: (path) => JSON.parse(readFileSync(resolve(root, path), "utf8")),
  git: (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
  gitOk: (args) => spawnSync("git", args, { cwd: root, stdio: "ignore" }).status === 0,
  run: (command, args, env) => {
    const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new ReleaseError("production_release_step_failed", `${command} ${args.join(" ")}`);
    }
  },
  // Output is captured, never echoed, so redacted provider values stay out of logs.
  capture: (command, args, env) => {
    const result = spawnSync(command, args, {
      cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new ReleaseError("production_release_step_failed", `${command} ${args[2] ?? ""} ${args[3] ?? ""}`.trim());
    }
    return result.stdout;
  },
  fetchText: async (url) => {
    const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new ReleaseError("production_release_fetch_failed", `${response.status} ${url}`);
    return await response.text();
  },
};

function writeReceipt(result) {
  const stamp = new Date().toISOString().slice(0, 10);
  const receiptPath = resolve(root, "docs/receipts", `${stamp}-production-${result.headSha.slice(0, 9)}.md`);
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, renderReleaseReceipt(result));
  mkdirSync(resolve(root, "artifacts"), { recursive: true });
  writeFileSync(resolve(root, "artifacts/release-production.json"), `${JSON.stringify(result, null, 2)}\n`);
  return receiptPath;
}

async function main() {
  const [command, target] = process.argv.slice(2);
  if (command === "rollback") {
    const result = await runProductionRollback(deps, target);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command !== "release" && command !== "verify") {
    console.error(usage());
    process.exit(2);
  }
  const result = await runProductionRelease(deps, {
    verifyOnly: command === "verify",
    allowSameBuild: process.argv.includes("--allow-same-build"),
  });
  if (result.status === "released") {
    const receiptPath = writeReceipt(result);
    console.log(`\nPASS: production released ${result.headSha}\nReceipt: ${receiptPath}`);
  } else {
    console.log(`\nPASS: production release verified for ${result.headSha} (nothing deployed)`);
  }
}

main().catch((error) => {
  console.error(`\nFAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
