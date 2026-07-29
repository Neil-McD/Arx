// @vitest-environment node

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const helperPath = resolve(process.cwd(), "scripts/guard_rg_compat.sh");
const temporaryDirectories: string[] = [];

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "polynet-rg-guard-"));
  temporaryDirectories.push(directory);
  const target = join(directory, "target.txt");
  return { directory, target };
}

function runGuard(script: string, env: Record<string, string>) {
  return spawnSync("bash", ["-c", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GUARD_HELPER_PATH: helperPath,
      ...env,
    },
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

test("fail-closed rg guard distinguishes clean, forbidden, and broken searches", () => {
  const { directory, target } = createFixture();
  writeFileSync(target, "canonical content\n", "utf8");

  const clean = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; guard_rg_assert_absent "fixture policy" -n forbidden "$TARGET_PATH"',
    { TARGET_PATH: target },
  );
  expect(clean.status).toBe(0);

  writeFileSync(target, "forbidden content\n", "utf8");
  const forbidden = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; guard_rg_assert_absent "fixture policy" -n forbidden "$TARGET_PATH"',
    { TARGET_PATH: target },
  );
  expect(forbidden.status).toBe(1);
  expect(forbidden.stderr).toContain("forbidden content");
  expect(forbidden.stderr).toContain(
    "FAIL: forbidden match detected: fixture policy",
  );

  const missing = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; guard_rg_assert_absent "fixture policy" -n forbidden "$TARGET_PATH"',
    { TARGET_PATH: join(directory, "missing.txt") },
  );
  expect(missing.status).toBeGreaterThan(1);
  expect(missing.stderr).toContain("No such file or directory");
  expect(missing.stderr).toContain(
    "FAIL: search failed while checking: fixture policy",
  );

  const invalidPatternTarget = join(directory, "invalid-pattern.txt");
  writeFileSync(invalidPatternTarget, "content\n", "utf8");
  const invalidPattern = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; guard_rg_assert_absent "fixture policy" -n "$SEARCH_PATTERN" "$TARGET_PATH"',
    {
      SEARCH_PATTERN: "[",
      TARGET_PATH: invalidPatternTarget,
    },
  );
  expect(invalidPattern.status).toBeGreaterThan(1);
  expect(invalidPattern.stderr).toContain(
    "FAIL: search failed while checking: fixture policy",
  );
});

test("rg capture returns matches, permits no-match, and rejects missing targets", () => {
  const { directory, target } = createFixture();
  writeFileSync(target, "canonical content\n", "utf8");

  const clean = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; output="$(guard_rg_capture "fixture capture" -n forbidden "$TARGET_PATH")"; test -z "$output"',
    { TARGET_PATH: target },
  );
  expect(clean.status).toBe(0);

  writeFileSync(target, "forbidden content\n", "utf8");
  const matched = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; guard_rg_capture "fixture capture" -n forbidden "$TARGET_PATH"',
    { TARGET_PATH: target },
  );
  expect(matched.status).toBe(0);
  expect(matched.stdout).toContain("forbidden content");

  const nestedMissingTarget = join(directory, "missing", "target.txt");
  mkdirSync(join(directory, "missing"), { recursive: true });
  const missing = runGuard(
    'set -euo pipefail; source "$GUARD_HELPER_PATH"; guard_rg_capture "fixture capture" -n forbidden "$TARGET_PATH"',
    { TARGET_PATH: nestedMissingTarget },
  );
  expect(missing.status).toBeGreaterThan(1);
  expect(missing.stderr).toContain(
    "FAIL: search failed while collecting: fixture capture",
  );
});
