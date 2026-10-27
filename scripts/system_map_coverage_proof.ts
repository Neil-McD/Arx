import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// docs/system-map.md must name every Convex module and every table, so the map
// cannot quietly fall behind the code. A backticked name counts; a backticked
// `prefix*` covers a family of modules or tables.

const root = process.cwd();
const map = readFileSync(join(root, "docs/system-map.md"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");

const named = new Set<string>();
const prefixes: string[] = [];
for (const [, token] of map.matchAll(/`([A-Za-z][A-Za-z0-9.]*\*?)`/g)) {
  if (token.endsWith("*")) prefixes.push(token.slice(0, -1));
  else named.add(token);
}
const covered = (name: string) =>
  named.has(name) || prefixes.some((prefix) => name.startsWith(prefix));

const isTest = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path);
const modules = execFileSync("git", ["ls-files", "convex"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => /^convex\/[^/]+\.ts$/.test(path) && !isTest(path) && existsSync(join(root, path)))
  .map((path) => path.slice("convex/".length, -".ts".length));
const tables = [...schema.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*): defineTable\(/gm)].map(([, name]) => name);

assert.ok(tables.length > 0, "found no tables in convex/schema.ts");

const missingModules = modules.filter((name) => !covered(name));
const missingTables = tables.filter((name) => !covered(name));

assert.deepEqual(
  { missingModules, missingTables },
  { missingModules: [], missingTables: [] },
  `name these in docs/system-map.md, in their area. Modules: ${missingModules.join(", ") || "none"}. Tables: ${missingTables.join(", ") || "none"}`,
);

console.log(`system_map_coverage_proof: ok (${modules.length} modules, ${tables.length} tables)`);
