import { randomUUID } from "node:crypto";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
} from "../../../convex/blaxelWorkspaceComputerProvider.ts";
import {
  WORKSPACE_PREVIEW_PORT_MAX,
  WORKSPACE_PREVIEW_PORT_MIN,
} from "../../../shared/workspacePreviewPort.ts";
import { elapsedMs, nowMs } from "./timing.ts";

export type BlaxelToolCallSummary = {
  turnId: string | null;
  callId: string | null;
  command: string;
  latencyMs: number;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  providerCommandId: string | null;
};

export type BlaxelToolResult = {
  summary: BlaxelToolCallSummary;
  contentText: string;
};

export function safeResourceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
}

export function neutralizeWorkspaceText(value: unknown): string {
  return String(value ?? "").replace(/blaxel/gi, "workspace");
}

export function previewText(value: unknown, max = 500): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeToolCommand(args: unknown, fallbackCommand: string): string {
  const record = asRecord(args);
  const raw = record && typeof record.command === "string" ? record.command : fallbackCommand;
  const command = raw.trim();
  if (!command) return fallbackCommand;
  if (command.length > 1000) {
    throw new Error("workspace_bash command is too long.");
  }
  return command;
}

export function buildBlaxelBashDynamicToolSpec(): Record<string, unknown> {
  return {
    name: "workspace_bash",
    description:
      "Run a shell command in the user's workspace. This is your only execution environment.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to run in the workspace.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  };
}

export function buildWorkspaceServeDynamicToolSpec(): Record<string, unknown> {
  return {
    name: "workspace_serve",
    description:
      "Start a long-running server (dev server, app, API) in the user's workspace and get back a preview URL the user can open. Use this for anything that listens on a port; never run servers with workspace_bash. Calling it again with the same port reuses or replaces the existing server, so retry on the SAME port rather than hopping ports. On failure, read server_output before changing approach.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command that starts the server, e.g. `npm run dev` or `node server.js`.",
        },
        port: {
          type: "integer",
          minimum: WORKSPACE_PREVIEW_PORT_MIN,
          maximum: WORKSPACE_PREVIEW_PORT_MAX,
          description: `Port the server listens on (${WORKSPACE_PREVIEW_PORT_MIN}-${WORKSPACE_PREVIEW_PORT_MAX}).`,
        },
      },
      required: ["command", "port"],
      additionalProperties: false,
    },
  };
}

export function readBlaxelEnvStatus(): {
  configured: boolean;
  missing: string[];
  workspace: string | null;
  region: string | null;
} {
  const missing = [];
  if (!String(process.env.BL_WORKSPACE ?? "").trim()) missing.push("BL_WORKSPACE");
  if (!String(process.env.BL_API_KEY ?? "").trim()) missing.push("BL_API_KEY");
  return {
    configured: missing.length === 0,
    missing,
    workspace: String(process.env.BL_WORKSPACE ?? "").trim() || null,
    region: String(process.env.BLAXEL_WORKSPACE_REGION ?? "").trim() || "us-pdx-1",
  };
}

export async function ensureBlaxelSandbox(params: {
  sandboxName: string;
  labels?: Record<string, string>;
  requireExisting?: boolean;
}): Promise<{
  providerSandboxId: string | null;
  workspaceRoot: string | null;
}> {
  const ensured = await ensureBlaxelWorkspaceComputer({
    sandboxName: params.sandboxName,
    lifecycleIntent: "agent_run",
    requireExisting: params.requireExisting === true,
    labels: {
      purpose: "polynet-codex-worker-service",
      ...(params.labels ?? {}),
    },
  });
  if (ensured.ok === false) {
    throw new Error(`Blaxel sandbox ensure failed: ${ensured.code}: ${ensured.message}`);
  }
  return {
    providerSandboxId: ensured.providerSandboxId,
    workspaceRoot: ensured.workspaceRoot,
  };
}

export async function destroyBlaxelSandboxBestEffort(sandboxName: string): Promise<{
  ok: boolean;
  failureCode: string | null;
}> {
  try {
    const cleanup = await destroyBlaxelWorkspaceComputer({ sandboxName });
    return {
      ok: cleanup.ok,
      failureCode: cleanup.ok ? null : cleanup.code,
    };
  } catch (error) {
    return {
      ok: false,
      failureCode: error instanceof Error ? error.message : "cleanup_failed",
    };
  }
}

export async function runBlaxelBash(params: {
  sandboxName: string;
  turnId: string | null;
  callId: string | null;
  command: string;
  timeoutSeconds: number;
}): Promise<BlaxelToolResult> {
  const startedAtMs = nowMs();
  const result = await executeBlaxelWorkspaceCommand({
    sandboxName: params.sandboxName,
    cwd: ".",
    command: params.command,
    processName: safeResourceName(`polynet-codex-worker-${randomUUID().slice(0, 8)}`),
    waitForCompletion: true,
    timeoutSeconds: params.timeoutSeconds,
  });
  const latencyMs = elapsedMs(startedAtMs);
  if (result.ok === false) {
    const summary: BlaxelToolCallSummary = {
      turnId: params.turnId,
      callId: params.callId,
      command: params.command,
      latencyMs,
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: result.message,
      providerCommandId: null,
    };
    return {
      summary,
      contentText: JSON.stringify(
        {
          command: params.command,
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: "",
          failureCode: neutralizeWorkspaceText(result.code),
          failureMessage: neutralizeWorkspaceText(result.message),
        },
        null,
        2,
      ),
    };
  }

  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  const ok = (result.exitCode ?? 0) === 0;
  const summary: BlaxelToolCallSummary = {
    turnId: params.turnId,
    callId: params.callId,
    command: params.command,
    latencyMs,
    ok,
    exitCode: result.exitCode ?? null,
    stdout,
    stderr,
    providerCommandId: result.providerCommandId ?? null,
  };
  return {
    summary,
    contentText: JSON.stringify(
      {
        command: params.command,
        ok,
        exitCode: result.exitCode ?? null,
        stdout,
        stderr,
      },
      null,
      2,
    ),
  };
}
