import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Every Convex module must be reached by first-party code: the web app, the
// edge, Vercel functions, the CLI, or another live Convex module. A module that
// only tests and proof scripts reach is dead weight and must be deleted.

const root = process.cwd();
const ENTRY_MODULES = new Set(["auth.config", "crons", "http", "schema"]);

// Named exceptions, each with its reason. Keep this list short: every entry
// is either a hand-run operator tool or waiting on a decision or a later slice.
const ALLOWED = new Map([
  ["stagingSeedBriefLab", "operator tool: seeds staging by hand"],
  ["anonymousUserCleanup", "operator tool: data deletion, run by hand"],
  ["communityMaintenance", "operator tool: purges orphaned user artifacts, run by hand"],
  ["communityCognitionCleanup", "operator tool: drains a deleted community's cognition data"],
  ["communityInteractionBackfill", "needed to finish the legacy chat retirement"],
  ["communityChannelAudit", "General channel migration: delete after two clean production audits (residue map R-009)"],
  ["communityChannelBackfill", "General channel migration: delete after two clean production audits (residue map R-009)"],
  ["communityAiFeedRetirement", "data retirement job; removed with the AI feed tables"],
  ["communityWeeklyDigestWorker", "dormant by design until the weekly digest gets a cron"],
  ["communityIntegrationActions", "stub for the cached production web's HubSpot callback page; delete next release (POL-21)"],
]);

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => path && existsSync(join(root, path)));
const isTest = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path);
const sources = tracked.filter(
  (path) =>
    /^(convex|apps|shared|api|infra|packages)\//.test(path) &&
    /\.(ts|tsx|js|mjs|cjs)$/.test(path) &&
    !path.startsWith("convex/_generated/") &&
    !path.includes("node_modules/") &&
    !isTest(path),
);
const text = new Map(sources.map((path) => [path, readFileSync(join(root, path), "utf8")]));

const modules = tracked
  .filter((path) => /^convex\/[^/]+\.ts$/.test(path) && !isTest(path))
  .map((path) => path.slice("convex/".length, -".ts".length));

for (const name of ALLOWED.keys()) {
  assert.ok(modules.includes(name), `remove ${name} from ALLOWED: the module no longer exists`);
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function referencePattern(name: string): RegExp {
  const n = escape(name);
  return new RegExp(
    [
      `\\b(?:api|internal)\\.${n}\\b`, // api.x / internal.x
      `[.)\\]]\\s*${n}\\s*\\.\\s*\\w`, // (internal as any).x.fn, internalRefs.x\n  .fn
      `\\[\\s*["'\`]${n}["'\`]\\s*\\]`, // refs["x"]
      `["'\`]${n}:[A-Za-z]`, // "x:fn"
      `(?:from|import)\\s*\\(?\\s*["'][^"']*\\/${n}(?:\\.ts)?["']`, // import ... "./x" or "./x.ts"
    ].join("|"),
  );
}

// Reachability from live roots: code outside convex/ (web app, edge, Vercel
// functions, CLI, shared), the entry modules and the named exceptions. A module
// is live only when live code references it, so dead modules that reference
// each other cannot keep each other alive.
const moduleFile = (name: string) => `convex/${name}.ts`;
const live = new Set(modules.filter((name) => ENTRY_MODULES.has(name) || ALLOWED.has(name)));
const liveSources = () =>
  [...text].filter(
    ([path]) => !path.startsWith("convex/") || live.has(path.slice("convex/".length, -".ts".length)),
  );
for (let grew = true; grew; ) {
  grew = false;
  const sourcesNow = liveSources();
  for (const name of modules) {
    if (live.has(name)) continue;
    const pattern = referencePattern(name);
    if (sourcesNow.some(([path, source]) => path !== moduleFile(name) && pattern.test(source))) {
      live.add(name);
      grew = true;
    }
  }
}
const orphans = modules.filter((name) => !live.has(name));

assert.deepEqual(
  orphans,
  [],
  `Convex modules with no first-party caller (delete them with their tests, or wire them up): ${orphans.join(", ")}`,
);

console.log(`no_orphan_modules_proof: ok (${modules.length} modules, ${ALLOWED.size} named exceptions)`);
