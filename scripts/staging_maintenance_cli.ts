import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type StagingCliOptions = {
  deploymentName: string;
  stagingUrl: string;
  ownerEmail: string;
  projectName: string;
  keepToken: boolean;
  dryRun: boolean;
};

export function readFlag(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function parseCommonOptions(): StagingCliOptions {
  return {
    deploymentName: readFlag("--deployment-name") ?? "quick-porcupine-949",
    stagingUrl: readFlag("--staging-url") ?? "https://polynet-staging.vercel.app",
    ownerEmail: readFlag("--owner-email") ?? "neilmcdevittd@gmail.com",
    projectName: readFlag("--project-name") ?? "General",
    keepToken: hasFlag("--keep-token"),
    dryRun: hasFlag("--dry-run"),
  };
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function run(command: string, args: string[], options?: { input?: string }): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      input: options?.input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as {
      status?: number;
      signal?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    throw new Error(
      [
        `Command failed: ${command} ${formatSafeCommandArgs(args)}`,
        failure.status === undefined ? null : `status=${failure.status}`,
        failure.signal ? `signal=${failure.signal}` : null,
        failure.stdout ? `stdout=${redactSensitiveText(String(failure.stdout))}` : null,
        failure.stderr ? `stderr=${redactSensitiveText(String(failure.stderr))}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

const SENSITIVE_KEY_PATTERN =
  /token|authorization|secret|api[_-]?key|credential|password|access[_-]?token|refresh[_-]?token/i;

function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "<redacted>"
      : redactSensitiveValue(entry);
  }
  return out;
}

function redactSensitiveText(value: string, maxChars = 4_000): string {
  const redacted = String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer <redacted>")
    .replace(/pnt_[A-Za-z0-9_-]{12,}/g, "pnt_<redacted>")
    .replace(
      /(["']?(?:maintenanceToken|token|authorization|secret|api[_-]?key|credential|password|accessToken|refreshToken)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi,
      "$1<redacted>",
    );
  return redacted.length > maxChars
    ? `${redacted.slice(redacted.length - maxChars)}\n...(truncated to tail)...`
    : redacted;
}

function formatSafeCommandArgs(args: readonly string[]): string {
  return args
    .map((arg) => {
      const trimmed = String(arg ?? "").trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return redactSensitiveText(trimmed, 1_000);
      }
      try {
        return JSON.stringify(redactSensitiveValue(JSON.parse(trimmed)));
      } catch {
        return redactSensitiveText(trimmed, 1_000);
      }
    })
    .join(" ");
}

export function runJson(command: string, args: string[]): any {
  const raw = run(command, args).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Command did not return JSON: ${command} ${formatSafeCommandArgs(args)}\n${redactSensitiveText(raw)}`,
    );
  }
}

export function convexDeploymentArgs(options: StagingCliOptions): string[] {
  return ["--deployment-name", options.deploymentName];
}

export function convexRunJson(options: StagingCliOptions, functionName: string, payload: Record<string, unknown>): any {
  return runJson("npx", [
    "convex",
    "run",
    ...convexDeploymentArgs(options),
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    functionName,
    JSON.stringify(payload),
  ]);
}

function convexEnvSet(options: StagingCliOptions, name: string, value: string): void {
  run("npx", ["convex", "env", ...convexDeploymentArgs(options), "set", name, value]);
}

function convexEnvRemove(options: StagingCliOptions, name: string): void {
  try {
    run("npx", ["convex", "env", ...convexDeploymentArgs(options), "remove", name]);
  } catch {
    // Cleanup is best-effort; a missing token is already safe.
  }
}

export function convexEnvGet(options: StagingCliOptions, name: string): string {
  try {
    return run("npx", ["convex", "env", ...convexDeploymentArgs(options), "get", name]).trim();
  } catch {
    return "";
  }
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function currentProcessLockPayload(options: StagingCliOptions): string {
  return JSON.stringify({
    lockId: randomBytes(8).toString("hex"),
    pid: process.pid,
    deploymentName: options.deploymentName,
    startedAt: Date.now(),
  });
}

function isProcessAlive(pid: unknown): boolean {
  const normalized = Math.floor(Number(pid));
  if (!Number.isFinite(normalized) || normalized <= 0) return false;
  try {
    process.kill(normalized, 0);
    return true;
  } catch (error) {
    return (error as { code?: string })?.code === "EPERM";
  }
}

function removeStaleMaintenanceSetupLock(lockPath: string): boolean {
  let ageMs = 0;
  try {
    const stat = statSync(lockPath);
    ageMs = Date.now() - stat.mtimeMs;
    const raw = readFileSync(lockPath, "utf8");
    if (!raw.trim()) {
      if (ageMs > 30_000) {
        rmSync(lockPath, { force: true });
        return true;
      }
      return false;
    }
    const parsed = raw ? JSON.parse(raw) : null;
    if (!isProcessAlive(parsed?.pid) || ageMs > 15 * 60 * 1000) {
      rmSync(lockPath, { force: true });
      return true;
    }
  } catch {
    if (ageMs > 30_000) {
      rmSync(lockPath, { force: true });
      return true;
    }
  }
  return false;
}

function acquireMaintenanceSetupLock(options: StagingCliOptions): () => void {
  const safeDeploymentName = options.deploymentName.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const lockPath = path.join(
    os.tmpdir(),
    `polynet-staging-maintenance-${safeDeploymentName}.lock`,
  );
  const deadline = Date.now() + 5 * 60_000;
  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      const lockPayload = currentProcessLockPayload(options);
      writeFileSync(fd, lockPayload);
      return () => {
        try {
          closeSync(fd);
        } finally {
          try {
            if (readFileSync(lockPath, "utf8") === lockPayload) {
              rmSync(lockPath, { force: true });
            }
          } catch {
            // If another process already cleared the lock, release is complete.
          }
        }
      };
    } catch (error) {
      if ((error as { code?: string })?.code === "EEXIST") {
        if (removeStaleMaintenanceSetupLock(lockPath)) continue;
        if (Date.now() <= deadline) {
          sleepMs(200);
          continue;
        }
        throw new Error(`Timed out waiting for staging maintenance lock: ${lockPath}`);
      }
      if (Date.now() > deadline) {
        throw error;
      }
      sleepMs(200);
    }
  }
}

export function withMaintenanceToken<T>(
  options: StagingCliOptions,
  callback: (token: string) => T,
): T {
  const provided = String(process.env.POLYNET_STAGING_MAINTENANCE_TOKEN ?? "").trim();
  if (provided) return callback(provided);

  const releaseLock = acquireMaintenanceSetupLock(options);
  let generated = false;
  let token = "";
  try {
    token = convexEnvGet(options, "POLYNET_STAGING_MAINTENANCE_TOKEN");
    if (!token) {
      token = randomBytes(32).toString("hex");
      generated = true;
      convexEnvSet(options, "POLYNET_STAGING_MAINTENANCE_TOKEN", token);
    }
    convexEnvSet(options, "POLYNET_STAGING_MAINTENANCE_ENABLED", "true");
    return callback(token);
  } finally {
    if (generated && !options.keepToken) {
      convexEnvRemove(options, "POLYNET_STAGING_MAINTENANCE_TOKEN");
    }
    releaseLock();
  }
}

export function buildMaintenancePayload(
  options: StagingCliOptions,
  token: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    maintenanceToken: token,
    ownerEmail: options.ownerEmail,
    projectName: options.projectName,
    ...extra,
  };
}

export function assert(condition: unknown, message: string): void {
  if (!condition) fail(message);
}

export function redactFingerprintForOutput(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;
  return raw;
}
