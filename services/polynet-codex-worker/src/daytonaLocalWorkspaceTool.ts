import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DAYTONA_CODEX_WORKSPACE_ROOT } from "../../../shared/daytonaCodexRuntimePolicy.ts";
import {
  neutralizeWorkspaceText,
  previewText,
  safeResourceName,
  type BlaxelToolCallSummary,
  type BlaxelToolResult,
} from "./blaxelTool.ts";
import { elapsedMs, nowMs } from "./timing.ts";

const MAX_OUTPUT_CHARS = 120_000;
const DEFAULT_DAYTONA_WORKSPACE_ROOT = DAYTONA_CODEX_WORKSPACE_ROOT;

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function resolveDaytonaWorkspaceRoot(): string {
  const explicit = readEnv("POLYNET_DAYTONA_WORKSPACE_ROOT");
  if (explicit) return path.resolve(explicit);
  if (existsSync("/home/daytona")) return DEFAULT_DAYTONA_WORKSPACE_ROOT;
  if (existsSync("/workspace")) return "/workspace";
  return process.cwd();
}

function resolveDaytonaSandboxId(): string | null {
  return (
    readEnv("DAYTONA_SANDBOX_ID") ||
    readEnv("DAYTONA_SANDBOX") ||
    readEnv("DAYTONA_WORKSPACE_ID") ||
    null
  );
}

function previewUrlPatternForPort(port: number): string | null {
  const explicit = readEnv("POLYNET_DAYTONA_PREVIEW_URL_PATTERN");
  if (explicit) return explicit.replaceAll("{port}", String(port));
  const sandboxId = resolveDaytonaSandboxId();
  if (!sandboxId) return null;
  return `https://${port}-${sandboxId}.proxy.daytona.works`;
}

export function readDaytonaLocalEnvStatus(): {
  configured: boolean;
  missing: string[];
  workspaceRoot: string;
  sandboxId: string | null;
  previewUrlPattern: string | null;
} {
  const workspaceRoot = resolveDaytonaWorkspaceRoot();
  const missing = existsSync(workspaceRoot) ? [] : ["POLYNET_DAYTONA_WORKSPACE_ROOT"];
  return {
    configured: missing.length === 0,
    missing,
    workspaceRoot,
    sandboxId: resolveDaytonaSandboxId(),
    previewUrlPattern:
      readEnv("POLYNET_DAYTONA_PREVIEW_URL_PATTERN") ||
      previewUrlPatternForPort(3000) ||
      null,
  };
}

export function getDaytonaWorkspaceRoot(): string {
  return resolveDaytonaWorkspaceRoot();
}

export function getDaytonaPreviewUrlPattern(): string | null {
  return readDaytonaLocalEnvStatus().previewUrlPattern;
}

export async function ensureDaytonaLocalWorkspace(params: {
  sandboxName: string;
  requireExisting?: boolean;
}): Promise<{
  providerSandboxId: string | null;
  workspaceRoot: string;
}> {
  const workspaceRoot = resolveDaytonaWorkspaceRoot();
  await mkdir(workspaceRoot, { recursive: true });
  return {
    providerSandboxId: resolveDaytonaSandboxId() || params.sandboxName,
    workspaceRoot,
  };
}

export async function destroyDaytonaLocalWorkspaceBestEffort(): Promise<{
  ok: boolean;
  failureCode: string | null;
}> {
  // The Daytona sandbox lifecycle is owned by Daytona/PolyNet orchestration.
  // A worker running inside the sandbox must not delete its own host.
  return { ok: true, failureCode: null };
}

function appendBounded(target: { value: string }, chunk: unknown): void {
  if (target.value.length >= MAX_OUTPUT_CHARS) return;
  const next = String(chunk ?? "");
  target.value = `${target.value}${next}`.slice(0, MAX_OUTPUT_CHARS);
}

export async function runDaytonaLocalBash(params: {
  sandboxName: string;
  turnId: string | null;
  callId: string | null;
  command: string;
  timeoutSeconds: number;
}): Promise<BlaxelToolResult> {
  const startedAtMs = nowMs();
  const workspaceRoot = resolveDaytonaWorkspaceRoot();
  await mkdir(workspaceRoot, { recursive: true });
  const processName = safeResourceName(`polynet-daytona-${Date.now()}`);
  const stdout = { value: "" };
  const stderr = { value: "" };

  const result = await new Promise<{
    exitCode: number | null;
    timedOut: boolean;
    error: Error | null;
  }>((resolve) => {
    let settled = false;
    let timedOut = false;
    const child = spawn("/bin/sh", ["-lc", params.command], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (payload: {
      exitCode: number | null;
      timedOut: boolean;
      error: Error | null;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 1000);
    }, Math.max(1, params.timeoutSeconds) * 1000);
    child.stdout.on("data", (chunk) => appendBounded(stdout, chunk));
    child.stderr.on("data", (chunk) => appendBounded(stderr, chunk));
    child.on("error", (error) => finish({ exitCode: null, timedOut, error }));
    child.on("exit", (code) => finish({ exitCode: code, timedOut, error: null }));
  });

  if (result.timedOut && !stderr.value.includes("timed out")) {
    stderr.value = `${stderr.value}\nCommand timed out after ${params.timeoutSeconds}s.`;
  }
  const latencyMs = elapsedMs(startedAtMs);
  const ok = !result.error && !result.timedOut && (result.exitCode ?? 0) === 0;
  const failureMessage = result.error
    ? neutralizeWorkspaceText(result.error.message)
    : result.timedOut
      ? `workspace command timed out after ${params.timeoutSeconds}s`
      : "";
  const summary: BlaxelToolCallSummary = {
    turnId: params.turnId,
    callId: params.callId,
    command: params.command,
    latencyMs,
    ok,
    exitCode: result.exitCode,
    stdout: stdout.value,
    stderr: failureMessage ? `${stderr.value}\n${failureMessage}`.trim() : stderr.value,
    providerCommandId: processName,
  };
  return {
    summary,
    contentText: JSON.stringify(
      {
        command: params.command,
        ok,
        exitCode: result.exitCode,
        stdout: summary.stdout,
        stderr: summary.stderr,
        workspaceRoot,
        stdoutPreview: previewText(summary.stdout, 1000),
        stderrPreview: previewText(summary.stderr, 1000),
      },
      null,
      2,
    ),
  };
}

export async function startDaytonaLocalServer(params: {
  command: string;
  port: number;
}): Promise<
  | {
      ok: true;
      previewUrl: string | null;
      previewUrlHint: string | null;
      providerSandboxId: string | null;
      pid: number | null;
      outputTail: string;
    }
  | {
      ok: false;
      failureCode: string;
      failureMessage: string;
      outputTail: string;
    }
> {
  const workspaceRoot = resolveDaytonaWorkspaceRoot();
  await mkdir(workspaceRoot, { recursive: true });
  const stdout = { value: "" };
  const stderr = { value: "" };
  const child = spawn("/bin/sh", ["-lc", params.command], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      PORT: String(params.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout.on("data", (chunk) => appendBounded(stdout, chunk));
  child.stderr.on("data", (chunk) => appendBounded(stderr, chunk));

  const earlyExit = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    error: Error | null;
  } | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 1500);
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: null, signal: null, error });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, error: null });
    });
  });

  const outputTail = previewText(`${stdout.value}\n${stderr.value}`, 2000);
  if (earlyExit) {
    return {
      ok: false,
      failureCode: earlyExit.error ? "workspace_serve_spawn_failed" : "workspace_serve_exited",
      failureMessage: earlyExit.error
        ? neutralizeWorkspaceText(earlyExit.error.message)
        : `Server command exited before preview was ready: code=${earlyExit.code ?? "null"} signal=${earlyExit.signal ?? "null"}`,
      outputTail,
    };
  }

  child.unref();
  return {
    ok: true,
    previewUrl: null,
    previewUrlHint: previewUrlPatternForPort(params.port),
    providerSandboxId: resolveDaytonaSandboxId(),
    pid: child.pid ?? null,
    outputTail,
  };
}
