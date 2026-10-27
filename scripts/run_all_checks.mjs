// Runs every `check:*` script in package.json that the release gate does not
// already run, so no check can exist without running. Also fails when a check
// file in scripts/ is not wired into package.json or another script.
//
// Usage: node scripts/run_all_checks.mjs [--list]

import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CONCURRENCY = 6;
const GATE_FILES = ["scripts/release_gate.mjs", "scripts/foundation_baseline_gate.sh"];
// Files in scripts/ that look like checks but are tools run by hand.
const NOT_CHECKS = /(_browser_qa\.mjs|_dry_run\.ts|_report\.sh|Preflight\.ts|_fixture\.ts)$/;
const CHECK_FILE = /(_proof|_contract|_guard|_check)\.(ts|mjs|sh)$/;

const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
const gateText = GATE_FILES.map((path) => readFileSync(join(ROOT, path), "utf8")).join("\n");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Scripts the gate already runs, directly or through `npm run` chains.
const reached = new Set(Object.keys(scripts).filter((name) => new RegExp(`\\b${escape(name)}\\b`).test(gateText)));
for (let grew = true; grew; ) {
  grew = false;
  for (const name of [...reached]) {
    for (const other of Object.keys(scripts)) {
      if (!reached.has(other) && new RegExp(`npm run ${escape(other)}(\\s|$|&|")`).test(scripts[name])) {
        reached.add(other);
        grew = true;
      }
    }
  }
}
reached.add("check:all");
const pending = Object.keys(scripts).filter((name) => name.startsWith("check:") && !reached.has(name));

// Every check file must be wired somewhere, or it silently never runs.
const scriptDir = join(ROOT, "scripts");
const scriptFiles = readdirSync(scriptDir).filter((file) => statSync(join(scriptDir, file)).isFile());
const scriptText = new Map(scriptFiles.map((file) => [file, readFileSync(join(scriptDir, file), "utf8")]));
const packageText = [join(ROOT, "package.json"), join(ROOT, "apps/web/package.json")]
  .map((path) => JSON.stringify(JSON.parse(readFileSync(path, "utf8")).scripts ?? {}))
  .join("\n");
const referencedByAnotherScript = (file) => {
  const stem = file.replace(/\.(ts|mjs|sh)$/, "");
  return [...scriptText].some(([other, text]) => other !== file && text.includes(stem));
};
const unwired = scriptFiles.filter(
  (file) => CHECK_FILE.test(file) && !NOT_CHECKS.test(file) && !packageText.includes(file) && !referencedByAnotherScript(file),
);

if (process.argv.includes("--list")) {
  console.log(pending.join("\n"));
  process.exit(0);
}

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("npm", ["run", "-s", name], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ name, ok: code === 0, output, ms: Date.now() - started }));
  });
}

const results = [];
const queue = [...pending];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) results.push(await run(queue.shift()));
  }),
);

const failed = results.filter((result) => !result.ok);
for (const result of failed) {
  console.log(`FAIL ${result.name}\n${result.output.split("\n").filter(Boolean).slice(-15).join("\n")}\n`);
}
if (unwired.length) {
  console.log(`FAIL: check files not wired into package.json or another script:\n  ${unwired.join("\n  ")}`);
}
console.log(`run_all_checks: ${results.length - failed.length}/${results.length} passed outside the gate's own steps`);
process.exit(failed.length || unwired.length ? 1 : 0);
