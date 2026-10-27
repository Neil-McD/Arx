// Runs every `check:*` script in package.json that the release gate does not
// already run, so no check can exist without running. Also fails when a check
// file in scripts/ is not run by the gate, a script it runs, or a script file
// one of those runs.
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

// Every check file must be run by something the gate runs, or it silently never
// runs. Trace from the gate and every reached package script through script
// files that reference each other in code (comments don't count).
const webScripts = JSON.parse(readFileSync(join(ROOT, "apps/web/package.json"), "utf8")).scripts ?? {};
const ranRoot = new Set([...reached, ...pending]);
const ranWeb = new Set();
for (const name of ranRoot) {
  for (const match of (scripts[name] ?? "").matchAll(/npm --prefix apps\/web run ([\w:.-]+)/g)) ranWeb.add(match[1]);
}
const stripComments = (file, text) =>
  file.endsWith(".sh")
    ? text.replace(/^\s*#.*$/gm, "")
    : text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const scriptDir = join(ROOT, "scripts");
const scriptFiles = readdirSync(scriptDir).filter((file) => statSync(join(scriptDir, file)).isFile());
const scriptCode = new Map(scriptFiles.map((file) => [file, stripComments(file, readFileSync(join(scriptDir, file), "utf8"))]));
const references = (code, file) => {
  const stem = escape(file.replace(/\.(ts|mjs|js|sh)$/, ""));
  return new RegExp(`["'\`/\\s]${stem}(\\.(ts|mjs|js|sh))?["'\`\\s]`).test(code);
};
const runText = [...[...ranRoot].map((name) => scripts[name] ?? ""), ...[...ranWeb].map((name) => webScripts[name] ?? "")]
  .map((command) => ` ${command} `)
  .join("\n");
const ranFiles = new Set(GATE_FILES.map((path) => path.replace("scripts/", "")));
for (const file of scriptFiles) if (references(runText, file)) ranFiles.add(file);
for (let grew = true; grew; ) {
  grew = false;
  for (const runner of [...ranFiles]) {
    for (const file of scriptFiles) {
      if (!ranFiles.has(file) && references(scriptCode.get(runner) ?? "", file)) {
        ranFiles.add(file);
        grew = true;
      }
    }
  }
}
const unwired = scriptFiles.filter((file) => CHECK_FILE.test(file) && !NOT_CHECKS.test(file) && !ranFiles.has(file));

if (process.argv.includes("--list")) {
  console.log(pending.join("\n"));
  if (unwired.length) console.log(`\nunwired:\n  ${unwired.join("\n  ")}`);
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
  console.log(`FAIL: check files nothing in the gate runs:\n  ${unwired.join("\n  ")}`);
}
console.log(`run_all_checks: ${results.length - failed.length}/${results.length} passed outside the gate's own steps`);
process.exit(failed.length || unwired.length ? 1 : 0);
