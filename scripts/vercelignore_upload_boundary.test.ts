import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

// Local deploys upload the working tree. Evaluate .vercelignore with real
// gitignore semantics in an isolated repository, so the repo's own .gitignore
// cannot mask a missing deployment exclusion.
let sandbox = "";

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vercelignore-"));
  execFileSync("git", ["init", "-q"], { cwd: sandbox });
  copyFileSync(resolve(__dirname, "../.vercelignore"), join(sandbox, ".gitignore"));
});

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

function ignored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--no-index", "-q", path], { cwd: sandbox });
    return true;
  } catch {
    return false;
  }
}

test("local secrets, pulled Vercel env files, and local build state are never uploaded", () => {
  for (const path of [
    ".env",
    ".env.local",
    ".env.staging.local",
    ".env.blaxel.local",
    ".env.example",
    "apps/web/.env.local",
    ".vercel/.env.production.local",
    ".vercel/project.json",
    ".claude/settings.local.json",
    "node_modules/convex/package.json",
    "apps/web/node_modules/vite/package.json",
    "dist/index.html",
    "apps/web/dist/version.json",
    "artifacts/release-gate.json",
    "references/repos/example/README.md",
    ".worktrees/example/package.json",
  ]) {
    expect({ path, ignored: ignored(path) }).toEqual({ path, ignored: true });
  }
});

test("deployment source and build inputs are still uploaded", () => {
  for (const path of [
    "package.json",
    "package-lock.json",
    "vercel.json",
    "apps/web/package.json",
    "apps/web/vite.config.ts",
    "apps/web/src/App.tsx",
    "api/auth/session.js",
    "convex/schema.ts",
    "convex/_generated/api.d.ts",
    "shared/founderPlan.ts",
    "apps/web/public/favicon.svg",
  ]) {
    expect({ path, ignored: ignored(path) }).toEqual({ path, ignored: false });
  }
});
