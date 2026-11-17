#!/usr/bin/env node
// The release gate's dependency audit. Two rules:
//  1. What ships (production dependencies) has no known advisory at all.
//  2. Everything else (build and test tools) has none either, except the
//     advisories named below, each with why it is safe to wait and when it
//     was allowed. An exception is for one advisory, never for a package or a
//     severity, and it is removed as soon as a fixed version exists.
// Usage: node scripts/dependency_audit_check.mjs [--prefix <dir>]
import { spawnSync } from "node:child_process";

export const ALLOWED_DEV_ADVISORIES = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    allowed: "2026-11-17",
    why: "picomatch ReDoS on hostile glob patterns. No fixed version exists (latest 4.0.7 is affected). "
      + "It reaches us only through vite and vitest, which run on our own glob patterns at build and test time, "
      + "never on input from a visitor. Remove this entry when picomatch ships a fix.",
  },
];

// Every advisory an `npm audit --json` report names, by its GHSA id.
export function advisoriesIn(report) {
  const found = new Map();
  for (const entry of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (!via || typeof via !== "object") continue;
      const id = String(via.url ?? "").split("/").pop() || String(via.source ?? via.title ?? "unknown");
      found.set(id, { id, name: via.name ?? entry.name, severity: via.severity ?? entry.severity, title: via.title ?? "" });
    }
  }
  return [...found.values()];
}

export function unexcused(report, allowed = ALLOWED_DEV_ADVISORIES) {
  const ids = new Set(allowed.map((entry) => entry.id));
  return advisoriesIn(report).filter((advisory) => !ids.has(advisory.id));
}

function audit(prefix, extra) {
  const args = [...(prefix ? ["--prefix", prefix] : []), "audit", "--json", ...extra];
  const result = spawnSync("npm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try {
    const report = JSON.parse(result.stdout);
    if (!report || typeof report.vulnerabilities !== "object") throw new Error("no vulnerabilities field");
    return report;
  } catch (error) {
    // No report is a failure, not a pass.
    console.error(`dependency_audit_check: npm audit gave no report (${error.message})\n${result.stderr ?? ""}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf("--prefix");
  const prefix = at >= 0 ? process.argv[at + 1] : null;
  const where = prefix ?? "root";
  const shipped = advisoriesIn(audit(prefix, ["--omit=dev"]));
  const rest = unexcused(audit(prefix, []));
  const print = (advisory) => console.error(`  ${advisory.severity} ${advisory.name}: ${advisory.title} (${advisory.id})`);
  if (shipped.length) { console.error(`dependency_audit_check: ${where}: advisories in what ships:`); shipped.forEach(print); }
  if (rest.length) { console.error(`dependency_audit_check: ${where}: advisories with no exception:`); rest.forEach(print); }
  if (shipped.length || rest.length) process.exit(1);
  console.log(`dependency_audit_check: ok (${where}; ${ALLOWED_DEV_ADVISORIES.length} named exception for build and test tools: ${ALLOWED_DEV_ADVISORIES.map((entry) => entry.id).join(", ")})`);
}
